namespace EvaluationService.Dtos;

// Résultat renvoyé après la correction d'un quiz.
public class ResultatDto
{
    public int Id { get; set; }
    public int QuizId { get; set; }
    public int UserId { get; set; }
    public double Score { get; set; }
    public DateTime DatePassage { get; set; }
}
