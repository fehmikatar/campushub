namespace EvaluationService.Dtos;

// Réponses envoyées par un étudiant pour un quiz.
// L'étudiant est identifié par le token (claim "sub"), jamais par le corps de la requête.
public class SubmitQuizDto
{
    public List<ReponseSoumiseDto>? Reponses { get; set; }
}

public class ReponseSoumiseDto
{
    public int QuestionId { get; set; }
    public int ReponseId { get; set; }
}
