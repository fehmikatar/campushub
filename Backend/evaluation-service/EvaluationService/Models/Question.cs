namespace EvaluationService.Models;

// Une question appartient à un quiz.
public class Question
{
    public int Id { get; set; }
    public string Texte { get; set; } = string.Empty;

    public int QuizId { get; set; }

    public List<Reponse> Reponses { get; set; } = new();
}
