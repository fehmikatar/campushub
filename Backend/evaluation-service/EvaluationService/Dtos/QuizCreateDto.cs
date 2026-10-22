namespace EvaluationService.Dtos;

// Données reçues pour créer un quiz (avec ses questions et réponses).
public class QuizCreateDto
{
    public string Titre { get; set; } = string.Empty;
    public int CourseId { get; set; }
    public List<QuestionCreateDto> Questions { get; set; } = new();
}

public class QuestionCreateDto
{
    public string Texte { get; set; } = string.Empty;
    public List<ReponseCreateDto> Reponses { get; set; } = new();
}

public class ReponseCreateDto
{
    public string Texte { get; set; } = string.Empty;
    public bool EstCorrecte { get; set; }
}
