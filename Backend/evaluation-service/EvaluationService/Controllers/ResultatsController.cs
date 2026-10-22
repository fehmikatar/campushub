using EvaluationService.Data;
using EvaluationService.Dtos;
using EvaluationService.Errors;
using EvaluationService.Models;
using EvaluationService.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvaluationService.Controllers;

// Tous les endpoints exigent un token valide.
[ApiController]
[Route("api/resultats")]
[Authorize]
public class ResultatsController : ControllerBase
{
    private readonly AppDbContext _context;

    public ResultatsController(AppDbContext context)
    {
        _context = context;
    }

    // GET api/resultats/etudiant/{etudiantId} : résultats d'un étudiant
    // (l'étudiant lui-même, ou un ENSEIGNANT/ADMIN).
    [HttpGet("etudiant/{etudiantId:guid}")]
    public async Task<ActionResult<IEnumerable<ResultatDto>>> GetByEtudiant(Guid etudiantId)
    {
        if (!User.IsEnseignantOrAdmin() && User.GetUserId() != etudiantId)
        {
            return ForbiddenError();
        }

        var resultats = await _context.Resultats
            .Where(r => r.EtudiantId == etudiantId)
            .AsNoTracking()
            .ToListAsync();

        return Ok(resultats.Select(ToResultatDto));
    }

    // GET api/resultats/quiz/{quizId} : résultats d'un quiz (ENSEIGNANT ou ADMIN).
    [HttpGet("quiz/{quizId:int}")]
    [Authorize(Roles = CampusHubRoles.EnseignantOuAdmin)]
    public async Task<ActionResult<IEnumerable<ResultatDto>>> GetByQuiz(int quizId)
    {
        var resultats = await _context.Resultats
            .Where(r => r.QuizId == quizId)
            .AsNoTracking()
            .ToListAsync();

        return Ok(resultats.Select(ToResultatDto));
    }

    // GET api/resultats/{id} : un résultat (son propriétaire, ou un ENSEIGNANT/ADMIN).
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ResultatDto>> GetById(int id)
    {
        var resultat = await _context.Resultats
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id);

        if (resultat is null)
        {
            return NotFoundError();
        }

        if (!User.IsEnseignantOrAdmin() && resultat.EtudiantId != User.GetUserId())
        {
            return ForbiddenError();
        }

        return Ok(ToResultatDto(resultat));
    }

    private ObjectResult ForbiddenError() => StatusCode(403, ApiErrorFactory.Forbidden());

    private ObjectResult NotFoundError() => StatusCode(404, ApiErrorFactory.NotFound());

    private static ResultatDto ToResultatDto(Resultat resultat) => new()
    {
        Id = resultat.Id,
        QuizId = resultat.QuizId,
        EtudiantId = resultat.EtudiantId,
        Score = resultat.Score,
        DatePassage = resultat.DatePassage
    };
}
