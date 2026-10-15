namespace EvaluationService.Dtos;

// Réponses envoyées par un étudiant pour un quiz.
public class SubmitQuizDto
{
    public int UserId { get; set; }
    public List<ReponseSoumiseDto> Reponses { get; set; } = new();
}

public class ReponseSoumiseDto
{
    public int QuestionId { get; set; }
    public int ReponseId { get; set; }
}
