using EvaluationService.Data;
using EvaluationService.Dtos;
using EvaluationService.Errors;
using EvaluationService.Models;
using EvaluationService.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvaluationService.Controllers;

// Tous les endpoints exigent un token valide (ajoutés au pipeline par [Authorize]).
[ApiController]
[Route("api/quizzes")]
[Authorize]
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
            return NotFoundError();
        }

        return Ok(ToQuizDto(quiz));
    }

    // POST api/quizzes : créer un quiz (ENSEIGNANT ou ADMIN).
    [HttpPost]
    [Authorize(Roles = CampusHubRoles.EnseignantOuAdmin)]
    public async Task<ActionResult<QuizDto>> Create(QuizCreateDto dto)
    {
        var erreurs = ValiderQuiz(dto);
        if (erreurs.Count > 0)
        {
            return ValidationError(erreurs);
        }

        var quiz = new Quiz
        {
            Titre = dto.Titre,
            CourseId = dto.CourseId,
            EnseignantId = User.GetUserId(), // propriétaire = "sub" du créateur
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

    // PUT api/quizzes/{id} : modifier un quiz (son créateur ou un ADMIN).
    [HttpPut("{id:int}")]
    [Authorize(Roles = CampusHubRoles.EnseignantOuAdmin)]
    public async Task<IActionResult> Update(int id, QuizCreateDto dto)
    {
        var quiz = await _context.Quizzes
            .Include(q => q.Questions)
                .ThenInclude(question => question.Reponses)
            .FirstOrDefaultAsync(q => q.Id == id);

        if (quiz is null)
        {
            return NotFoundError();
        }

        if (!EstProprietaireOuAdmin(quiz))
        {
            return ForbiddenError();
        }

        var erreurs = ValiderQuiz(dto);
        if (erreurs.Count > 0)
        {
            return ValidationError(erreurs);
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

    // DELETE api/quizzes/{id} : supprimer un quiz (son créateur ou un ADMIN).
    [HttpDelete("{id:int}")]
    [Authorize(Roles = CampusHubRoles.EnseignantOuAdmin)]
    public async Task<IActionResult> Delete(int id)
    {
        var quiz = await _context.Quizzes.FindAsync(id);
        if (quiz is null)
        {
            return NotFoundError();
        }

        if (!EstProprietaireOuAdmin(quiz))
        {
            return ForbiddenError();
        }

        _context.Quizzes.Remove(quiz);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // POST api/quizzes/{id}/submit : corriger les réponses (ETUDIANT connecté).
    [HttpPost("{id:int}/submit")]
    [Authorize(Roles = CampusHubRoles.Etudiant)]
    public async Task<ActionResult<ResultatDto>> Submit(int id, SubmitQuizDto dto)
    {
        var quiz = await _context.Quizzes
            .Include(q => q.Questions)
                .ThenInclude(question => question.Reponses)
            .FirstOrDefaultAsync(q => q.Id == id);

        if (quiz is null)
        {
            return NotFoundError();
        }

        if (quiz.Questions.Count == 0)
        {
            return StatusCode(400, ApiErrorFactory.Validation("This quiz contains no question."));
        }

        // On associe chaque question à la réponse choisie par l'étudiant.
        var choix = dto.Reponses.ToDictionary(r => r.QuestionId, r => r.ReponseId);

        int bonnesReponses = 0;
        foreach (var question in quiz.Questions)
        {
            if (!choix.TryGetValue(question.Id, out var reponseChoisieId))
            {
                continue; // Question non répondue : comptée comme fausse.
            }

            var reponseChoisie = question.Reponses.FirstOrDefault(r => r.Id == reponseChoisieId);
            if (reponseChoisie is { EstCorrecte: true })
            {
                bonnesReponses++;
            }
        }

        // Score en pourcentage.
        double score = (double)bonnesReponses / quiz.Questions.Count * 100;

        var resultat = new Resultat
        {
            QuizId = quiz.Id,
            EtudiantId = User.GetUserId(), // identité issue uniquement du token
            Score = score,
            DatePassage = DateTime.UtcNow
        };

        _context.Resultats.Add(resultat);
        await _context.SaveChangesAsync();

        return Ok(ToResultatDto(resultat));
    }

    // Vérifie les règles métier avant création/modification d'un quiz.
    private static List<FieldError> ValiderQuiz(QuizCreateDto dto)
    {
        var erreurs = new List<FieldError>();

        if (string.IsNullOrWhiteSpace(dto.Titre))
        {
            erreurs.Add(new FieldError("titre", "Le titre du quiz est obligatoire."));
        }

        if (dto.Questions.Count == 0)
        {
            erreurs.Add(new FieldError("questions", "Le quiz doit contenir au moins une question."));
        }

        for (int i = 0; i < dto.Questions.Count; i++)
        {
            var question = dto.Questions[i];

            if (question.Reponses.Count < 2)
            {
                erreurs.Add(new FieldError($"questions[{i}].reponses", "Chaque question doit avoir au moins deux réponses."));
            }
            else if (question.Reponses.Count(r => r.EstCorrecte) != 1)
            {
                erreurs.Add(new FieldError($"questions[{i}].reponses", "Chaque question doit avoir exactement une réponse correcte."));
            }
        }

        return erreurs;
    }

    private bool EstProprietaireOuAdmin(Quiz quiz)
        => User.IsAdmin() || quiz.EnseignantId == User.GetUserId();

    private ObjectResult ForbiddenError() => StatusCode(403, ApiErrorFactory.Forbidden());

    private ObjectResult NotFoundError() => StatusCode(404, ApiErrorFactory.NotFound());

    private ObjectResult ValidationError(IReadOnlyList<FieldError> erreurs)
        => StatusCode(400, ApiErrorFactory.Validation(fieldErrors: erreurs));

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
        EtudiantId = resultat.EtudiantId,
        Score = resultat.Score,
        DatePassage = resultat.DatePassage
    };
}
