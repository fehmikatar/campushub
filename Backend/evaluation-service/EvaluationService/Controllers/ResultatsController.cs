using EvaluationService.Data;
using EvaluationService.Dtos;
using EvaluationService.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EvaluationService.Controllers;

[ApiController]
[Route("api/resultats")]
public class ResultatsController : ControllerBase
{
    private readonly AppDbContext _context;

    public ResultatsController(AppDbContext context)
    {
        _context = context;
    }

    // GET api/resultats/user/{userId} : résultats d'un utilisateur.
    [HttpGet("user/{userId:int}")]
    public async Task<ActionResult<IEnumerable<ResultatDto>>> GetByUser(int userId)
    {
        var resultats = await _context.Resultats
            .Where(r => r.UserId == userId)
            .AsNoTracking()
            .ToListAsync();

        return Ok(resultats.Select(ToResultatDto));
    }

    // GET api/resultats/quiz/{quizId} : résultats d'un quiz.
    [HttpGet("quiz/{quizId:int}")]
    public async Task<ActionResult<IEnumerable<ResultatDto>>> GetByQuiz(int quizId)
    {
        var resultats = await _context.Resultats
            .Where(r => r.QuizId == quizId)
            .AsNoTracking()
            .ToListAsync();

        return Ok(resultats.Select(ToResultatDto));
    }

    // GET api/resultats/{id} : un résultat.
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ResultatDto>> GetById(int id)
    {
        var resultat = await _context.Resultats
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == id);

        if (resultat is null)
        {
            return NotFound();
        }

        return Ok(ToResultatDto(resultat));
    }

    private static ResultatDto ToResultatDto(Resultat resultat) => new()
    {
        Id = resultat.Id,
        QuizId = resultat.QuizId,
        UserId = resultat.UserId,
        Score = resultat.Score,
        DatePassage = resultat.DatePassage
    };
}
