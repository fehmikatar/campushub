namespace EvaluationService.Dtos;

// Données reçues pour créer un quiz (avec ses questions et réponses).
public class QuizCreateDto
{
    public string? Titre { get; set; }
    public int CourseId { get; set; }
    public List<QuestionCreateDto>? Questions { get; set; }
}

public class QuestionCreateDto
{
    public string? Texte { get; set; }
    public List<ReponseCreateDto>? Reponses { get; set; }
}

public class ReponseCreateDto
{
    public string? Texte { get; set; }
    public bool EstCorrecte { get; set; }
}
