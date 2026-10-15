namespace EvaluationService.Dtos;

// Version d'un quiz envoyée aux étudiants : sans le champ EstCorrecte.
public class QuizDto
{
    public int Id { get; set; }
    public string Titre { get; set; } = string.Empty;
    public int CourseId { get; set; }
    public List<QuestionDto> Questions { get; set; } = new();
}

public class QuestionDto
{
    public int Id { get; set; }
    public string Texte { get; set; } = string.Empty;
    public List<ReponseDto> Reponses { get; set; } = new();
}

public class ReponseDto
{
    public int Id { get; set; }
    public string Texte { get; set; } = string.Empty;
}
