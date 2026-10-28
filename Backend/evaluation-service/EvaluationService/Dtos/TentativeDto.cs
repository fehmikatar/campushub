namespace EvaluationService.Dtos;

// Tentative en cours renvoyée par POST /api/quizzes/{id}/start.
// LimiteUtc est null lorsque le quiz n'a pas de durée.
public class TentativeDto
{
    public int Id { get; set; }
    public int QuizId { get; set; }
    public Guid EtudiantId { get; set; }
    public DateTime DebutUtc { get; set; }
    public DateTime? LimiteUtc { get; set; }
}
