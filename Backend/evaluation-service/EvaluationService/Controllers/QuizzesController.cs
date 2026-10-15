using EvaluationService.Data;
using EvaluationService.Dtos;
using EvaluationService.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvaluationService.Controllers;

[ApiController]
[Route("api/quizzes")]
public class QuizzesController : ControllerBase
{
    private readonly AppDbContext _context;

    public QuizzesController(AppDbContext context)
    {
        _context = context;
    }

    // GET api/quizzes/course/{courseId} : liste des quiz d'un cours.
    [HttpGet("course/{courseId:int}")]
    public async Task<ActionResult<IEnumerable<QuizDto>>> GetByCourse(int courseId)
    {
        var quizzes = await _context.Quizzes
            .Where(q => q.CourseId == courseId)
            .Include(q => q.Questions)
                .ThenInclude(question => question.Reponses)
            .AsNoTracking()
            .ToListAsync();

        return Ok(quizzes.Select(ToQuizDto));
    }

    // GET api/quizzes/{id} : détail d'un quiz (sans EstCorrecte).
    [HttpGet("{id:int}")]
    public async Task<ActionResult<QuizDto>> GetById(int id)
    {
        var quiz = await _context.Quizzes
            .Include(q => q.Questions)
                .ThenInclude(question => question.Reponses)
            .AsNoTracking()
            .FirstOrDefaultAsync(q => q.Id == id);

        if (quiz is null)
        {
            return NotFound();
        }

        return Ok(ToQuizDto(quiz));
    }

    // POST api/quizzes : créer un quiz avec ses questions et réponses.
    [HttpPost]
    public async Task<ActionResult<QuizDto>> Create(QuizCreateDto dto)
    {
        var erreur = ValiderQuiz(dto);
        if (erreur is not null)
        {
            return BadRequest(erreur);
        }

        var quiz = new Quiz
        {
            Titre = dto.Titre,
            CourseId = dto.CourseId,
            Questions = dto.Questions.Select(question => new Question
            {
                Texte = question.Texte,
                Reponses = question.Reponses.Select(reponse => new Reponse
                {
                    Texte = reponse.Texte,
                    EstCorrecte = reponse.EstCorrecte
                }).ToList()
            }).ToList()
        };

        _context.Quizzes.Add(quiz);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = quiz.Id }, ToQuizDto(quiz));
    }

    // PUT api/quizzes/{id} : modifier un quiz (remplace questions et réponses).
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, QuizCreateDto dto)
    {
        var quiz = await _context.Quizzes
            .Include(q => q.Questions)
                .ThenInclude(question => question.Reponses)
            .FirstOrDefaultAsync(q => q.Id == id);

        if (quiz is null)
        {
            return NotFound();
        }

        var erreur = ValiderQuiz(dto);
        if (erreur is not null)
        {
            return BadRequest(erreur);
        }

        quiz.Titre = dto.Titre;
        quiz.CourseId = dto.CourseId;

        // On retire les questions existantes (les réponses suivent en cascade).
        _context.Questions.RemoveRange(quiz.Questions);
        quiz.Questions = dto.Questions.Select(question => new Question
        {
            Texte = question.Texte,
            Reponses = question.Reponses.Select(reponse => new Reponse
            {
                Texte = reponse.Texte,
                EstCorrecte = reponse.EstCorrecte
            }).ToList()
        }).ToList();

        await _context.SaveChangesAsync();

        return NoContent();
    }

    // DELETE api/quizzes/{id} : supprimer un quiz.
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var quiz = await _context.Quizzes.FindAsync(id);
        if (quiz is null)
        {
            return NotFound();
        }

        _context.Quizzes.Remove(quiz);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // POST api/quizzes/{id}/submit : corriger les réponses et enregistrer le résultat.
    [HttpPost("{id:int}/submit")]
    public async Task<ActionResult<ResultatDto>> Submit(int id, SubmitQuizDto dto)
    {
        var quiz = await _context.Quizzes
            .Include(q => q.Questions)
                .ThenInclude(question => question.Reponses)
            .FirstOrDefaultAsync(q => q.Id == id);

        if (quiz is null)
        {
            return NotFound();
        }

        if (quiz.Questions.Count == 0)
        {
            return BadRequest("Ce quiz ne contient aucune question.");
        }

        // On associe chaque question à la réponse choisie par l'étudiant.
        var choix = dto.Reponses.ToDictionary(r => r.QuestionId, r => r.ReponseId);

        int bonnesReponses = 0;
        foreach (var question in quiz.Questions)
        {
            if (!choix.TryGetValue(question.Id, out var reponseIdConcernee))
            {
                continue; // Question non répondue : comptée comme fausse.
            }

            var reponseChoisie = question.Reponses.FirstOrDefault(r => r.Id == reponseIdConcernee);
            if (reponseChoisie is not null && reponseChoisie.EstCorrecte)
            {
                bonnesReponses++;
            }
        }

        // Score en pourcentage.
        double score = (double)bonnesReponses / quiz.Questions.Count * 100;

        var resultat = new Resultat
        {
            QuizId = quiz.Id,
            UserId = dto.UserId,
            Score = score,
            DatePassage = DateTime.UtcNow
        };

        _context.Resultats.Add(resultat);
        await _context.SaveChangesAsync();

        return Ok(ToResultatDto(resultat));
    }

    // Vérifie les règles métier avant création/modification d'un quiz.
    private static string? ValiderQuiz(QuizCreateDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Titre))
        {
            return "Le titre du quiz est obligatoire.";
        }

        if (dto.Questions.Count == 0)
        {
            return "Le quiz doit contenir au moins une question.";
        }

        foreach (var question in dto.Questions)
        {
            if (question.Reponses.Count < 2)
            {
                return "Chaque question doit avoir au moins deux réponses.";
            }

            int correctes = question.Reponses.Count(r => r.EstCorrecte);
            if (correctes != 1)
            {
                return "Chaque question doit avoir exactement une réponse correcte.";
            }
        }

        return null;
    }

    private static QuizDto ToQuizDto(Quiz quiz) => new()
    {
        Id = quiz.Id,
        Titre = quiz.Titre,
        CourseId = quiz.CourseId,
        Questions = quiz.Questions.Select(question => new QuestionDto
        {
            Id = question.Id,
            Texte = question.Texte,
            Reponses = question.Reponses.Select(reponse => new ReponseDto
            {
                Id = reponse.Id,
                Texte = reponse.Texte
            }).ToList()
        }).ToList()
    };

    private static ResultatDto ToResultatDto(Resultat resultat) => new()
    {
        Id = resultat.Id,
        QuizId = resultat.QuizId,
        UserId = resultat.UserId,
        Score = resultat.Score,
        DatePassage = resultat.DatePassage
    };
}
