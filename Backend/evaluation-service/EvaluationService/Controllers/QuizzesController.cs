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
    private const int MaxTitreLength = 200;
    private const int MaxQuestionLength = 500;
    private const int MaxReponseLength = 300;
    private const int ToleranceDelaiSecondes = 30;

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
    public async Task<ActionResult<QuizDto>> Create(QuizCreateDto? dto)
    {
        if (dto is null)
        {
            return ValidationError(new[] { new FieldError("quiz", "Le corps de la requête est obligatoire.") });
        }

        var erreurs = ValiderQuiz(dto);
        if (erreurs.Count > 0)
        {
            return ValidationError(erreurs);
        }

        var quiz = new Quiz
        {
            Titre = dto.Titre!,
            CourseId = dto.CourseId,
            EnseignantId = User.GetUserId(), // propriétaire = "sub" du créateur
            MaxTentatives = dto.MaxTentatives ?? 1,
            DureeMinutes = dto.DureeMinutes,
            Questions = dto.Questions!.Select(question => new Question
            {
                Texte = question.Texte!,
                Reponses = question.Reponses!.Select(reponse => new Reponse
                {
                    Texte = reponse.Texte!,
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
    public async Task<IActionResult> Update(int id, QuizCreateDto? dto)
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

        // Modifier les questions rendrait les résultats déjà enregistrés incomparables.
        if (await _context.Resultats.AnyAsync(r => r.QuizId == id))
        {
            return ConflictError();
        }

        if (dto is null)
        {
            return ValidationError(new[] { new FieldError("quiz", "Le corps de la requête est obligatoire.") });
        }

        var erreurs = ValiderQuiz(dto);
        if (erreurs.Count > 0)
        {
            return ValidationError(erreurs);
        }

        quiz.Titre = dto.Titre!;
        quiz.CourseId = dto.CourseId;
        quiz.MaxTentatives = dto.MaxTentatives ?? 1;
        quiz.DureeMinutes = dto.DureeMinutes;

        // On retire les questions existantes (les réponses suivent en cascade).
        _context.Questions.RemoveRange(quiz.Questions);
        quiz.Questions = dto.Questions!.Select(question => new Question
        {
            Texte = question.Texte!,
            Reponses = question.Reponses!.Select(reponse => new Reponse
            {
                Texte = reponse.Texte!,
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

        // Supprimer le quiz laisserait des résultats orphelins et une historique incohérent.
        if (await _context.Resultats.AnyAsync(r => r.QuizId == id))
        {
            return ConflictError();
        }

        _context.Quizzes.Remove(quiz);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // POST api/quizzes/{id}/start : démarrer une tentative (ETUDIANT connecté).
    // Une tentative en cours et non expirée est renvoyée telle quelle (aucune nouvelle ligne).
    [HttpPost("{id:int}/start")]
    [Authorize(Roles = CampusHubRoles.Etudiant)]
    public async Task<ActionResult<TentativeDto>> Start(int id)
    {
        var quiz = await _context.Quizzes
            .AsNoTracking()
            .FirstOrDefaultAsync(q => q.Id == id);

        if (quiz is null)
        {
            return NotFoundError();
        }

        var etudiantId = User.GetUserId();

        if (await _context.Resultats.CountAsync(r => r.QuizId == id && r.EtudiantId == etudiantId) >= quiz.MaxTentatives)
        {
            return ConflictError("The maximum number of attempts for this quiz has been reached.");
        }

        var maintenant = DateTime.UtcNow;

        var tentative = await _context.Tentatives
            .OrderByDescending(t => t.Id)
            .FirstOrDefaultAsync(t => t.QuizId == id && t.EtudiantId == etudiantId);

        if (tentative is not null && EstExpiree(tentative, quiz, maintenant))
        {
            _context.Tentatives.Remove(tentative);
            tentative = null;
        }

        if (tentative is null)
        {
            tentative = new Tentative
            {
                QuizId = id,
                EtudiantId = etudiantId,
                DebutUtc = maintenant
            };

            _context.Tentatives.Add(tentative);
            await _context.SaveChangesAsync();
        }

        return Ok(ToTentativeDto(tentative, quiz));
    }

    // POST api/quizzes/{id}/submit : corriger les réponses (ETUDIANT connecté).
    [HttpPost("{id:int}/submit")]
    [Authorize(Roles = CampusHubRoles.Etudiant)]
    public async Task<ActionResult<ResultatDto>> Submit(int id, SubmitQuizDto? dto)
    {
        var quiz = await _context.Quizzes
            .Include(q => q.Questions)
                .ThenInclude(question => question.Reponses)
            .FirstOrDefaultAsync(q => q.Id == id);

        if (quiz is null)
        {
            return NotFoundError();
        }

        var etudiantId = User.GetUserId();

        // Quota de tentatives atteint : refus avant toute correction.
        if (await _context.Resultats.CountAsync(r => r.QuizId == id && r.EtudiantId == etudiantId) >= quiz.MaxTentatives)
        {
            return ConflictError("The maximum number of attempts for this quiz has been reached.");
        }

        var erreursSoumission = ValiderSoumission(dto, quiz);
        if (erreursSoumission.Count > 0)
        {
            return ValidationError(erreursSoumission);
        }

        if (quiz.Questions.Count == 0)
        {
            return StatusCode(400, ApiErrorFactory.Validation("This quiz contains no question."));
        }

        var tentative = await _context.Tentatives
            .OrderByDescending(t => t.Id)
            .FirstOrDefaultAsync(t => t.QuizId == id && t.EtudiantId == etudiantId);

        // Un quiz avec durée exige un /start préalable et une soumission dans les temps.
        if (quiz.DureeMinutes is int dureeMinutes)
        {
            if (tentative is null)
            {
                return StatusCode(400, ApiErrorFactory.Validation(
                    $"This quiz has a time limit: call POST /api/quizzes/{id}/start before submitting."));
            }

            var limiteUtc = tentative.DebutUtc.AddMinutes(dureeMinutes);
            if (DateTime.UtcNow > limiteUtc.AddSeconds(ToleranceDelaiSecondes))
            {
                return ConflictError("The time allowed for this quiz attempt has expired.");
            }
        }

        // On associe chaque question à la réponse choisie par l'étudiant.
        var choix = dto!.Reponses!.ToDictionary(r => r.QuestionId, r => r.ReponseId);

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
            EtudiantId = etudiantId, // identité issue uniquement du token
            Score = score,
            DatePassage = DateTime.UtcNow
        };

        // La tentative en cours est consommée par la soumission réussie.
        if (tentative is not null)
        {
            _context.Tentatives.Remove(tentative);
        }

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
        else if (dto.Titre.Length > MaxTitreLength)
        {
            erreurs.Add(new FieldError("titre", $"Le titre du quiz ne doit pas dépasser {MaxTitreLength} caractères."));
        }

        if (dto.CourseId <= 0)
        {
            erreurs.Add(new FieldError("courseId", "Le courseId doit être supérieur à 0."));
        }

        if (dto.MaxTentatives is int maxTentatives && maxTentatives < 1)
        {
            erreurs.Add(new FieldError("maxTentatives", "Le nombre maximal de tentatives doit être supérieur ou égal à 1."));
        }

        if (dto.DureeMinutes is int dureeMinutes && dureeMinutes < 1)
        {
            erreurs.Add(new FieldError("dureeMinutes", "La durée du quiz doit être supérieure ou égale à 1 minute."));
        }

        if (dto.Questions is null || dto.Questions.Count == 0)
        {
            erreurs.Add(new FieldError("questions", "Le quiz doit contenir au moins une question."));
            return erreurs;
        }

        for (int i = 0; i < dto.Questions.Count; i++)
        {
            var question = dto.Questions[i];

            if (question is null)
            {
                erreurs.Add(new FieldError($"questions[{i}]", "La question ne peut pas être null."));
                continue;
            }

            if (string.IsNullOrWhiteSpace(question.Texte))
            {
                erreurs.Add(new FieldError($"questions[{i}].texte", "Le texte de la question est obligatoire."));
            }
            else if (question.Texte.Length > MaxQuestionLength)
            {
                erreurs.Add(new FieldError($"questions[{i}].texte", $"Le texte de la question ne doit pas dépasser {MaxQuestionLength} caractères."));
            }

            if (question.Reponses is null || question.Reponses.Count < 2)
            {
                erreurs.Add(new FieldError($"questions[{i}].reponses", "Chaque question doit avoir au moins deux réponses."));
                continue;
            }

            for (int j = 0; j < question.Reponses.Count; j++)
            {
                var reponse = question.Reponses[j];

                if (reponse is null)
                {
                    erreurs.Add(new FieldError($"questions[{i}].reponses[{j}]", "La réponse ne peut pas être null."));
                    continue;
                }

                if (string.IsNullOrWhiteSpace(reponse.Texte))
                {
                    erreurs.Add(new FieldError($"questions[{i}].reponses[{j}].texte", "Le texte de la réponse est obligatoire."));
                }
                else if (reponse.Texte.Length > MaxReponseLength)
                {
                    erreurs.Add(new FieldError($"questions[{i}].reponses[{j}].texte", $"Le texte de la réponse ne doit pas dépasser {MaxReponseLength} caractères."));
                }
            }

            if (question.Reponses.Count(r => r is not null && r.EstCorrecte) != 1)
            {
                erreurs.Add(new FieldError($"questions[{i}].reponses", "Chaque question doit avoir exactement une réponse correcte."));
            }
        }

        return erreurs;
    }

    // Vérifie la cohérence des réponses soumises avant toute correction.
    private static List<FieldError> ValiderSoumission(SubmitQuizDto? dto, Quiz quiz)
    {
        var erreurs = new List<FieldError>();
        var reponses = dto?.Reponses;

        if (reponses is null || reponses.Count == 0)
        {
            erreurs.Add(new FieldError("reponses", "La liste des réponses est obligatoire et ne peut pas être vide."));
            return erreurs;
        }

        var questions = quiz.Questions.ToDictionary(q => q.Id);
        var questionIdsVus = new HashSet<int>();

        for (int i = 0; i < reponses.Count; i++)
        {
            var soumise = reponses[i];

            if (soumise is null)
            {
                erreurs.Add(new FieldError($"reponses[{i}]", "La réponse soumise ne peut pas être null."));
                continue;
            }

            if (!questionIdsVus.Add(soumise.QuestionId))
            {
                erreurs.Add(new FieldError($"reponses[{i}].questionId", "Cette question est présente plusieurs fois."));
                continue;
            }

            if (!questions.TryGetValue(soumise.QuestionId, out var question))
            {
                erreurs.Add(new FieldError($"reponses[{i}].questionId", "Cette question n'appartient pas à ce quiz."));
                continue;
            }

            if (question.Reponses.All(r => r.Id != soumise.ReponseId))
            {
                erreurs.Add(new FieldError($"reponses[{i}].reponseId", "Cette réponse n'appartient pas à la question indiquée."));
            }
        }

        return erreurs;
    }

    private bool EstProprietaireOuAdmin(Quiz quiz)
        => User.IsAdmin() || quiz.EnseignantId == User.GetUserId();

    // Une tentative sans durée n'expire jamais.
    private static bool EstExpiree(Tentative tentative, Quiz quiz, DateTime maintenant)
        => quiz.DureeMinutes is int dureeMinutes
            && maintenant > tentative.DebutUtc.AddMinutes(dureeMinutes).AddSeconds(ToleranceDelaiSecondes);

    private ObjectResult ForbiddenError() => StatusCode(403, ApiErrorFactory.Forbidden());

    private ObjectResult NotFoundError() => StatusCode(404, ApiErrorFactory.NotFound());

    private ObjectResult ConflictError(string? message = null)
        => StatusCode(409, message is null ? ApiErrorFactory.Conflict() : ApiErrorFactory.Conflict(message));

    private ObjectResult ValidationError(IReadOnlyList<FieldError> erreurs)
        => StatusCode(400, ApiErrorFactory.Validation(fieldErrors: erreurs));

    private static QuizDto ToQuizDto(Quiz quiz) => new()
    {
        Id = quiz.Id,
        Titre = quiz.Titre,
        CourseId = quiz.CourseId,
        MaxTentatives = quiz.MaxTentatives,
        DureeMinutes = quiz.DureeMinutes,
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

    private static TentativeDto ToTentativeDto(Tentative tentative, Quiz quiz)
    {
        // La valeur relue depuis SQL Server perd DateTimeKind : on la réaffirme en UTC.
        var debutUtc = DateTime.SpecifyKind(tentative.DebutUtc, DateTimeKind.Utc);

        return new()
        {
            Id = tentative.Id,
            QuizId = tentative.QuizId,
            EtudiantId = tentative.EtudiantId,
            DebutUtc = debutUtc,
            LimiteUtc = quiz.DureeMinutes is int dureeMinutes
                ? debutUtc.AddMinutes(dureeMinutes)
                : null
        };
    }
}
