namespace EvaluationService.Models;

// Un quiz rattaché à un cours (CourseId est une référence vers le service Course).
public class Quiz
{
    public int Id { get; set; }
    public string Titre { get; set; } = string.Empty;

    // Référence vers le service Course (pas de clé étrangère SQL).
    public int CourseId { get; set; }

    public List<Question> Questions { get; set; } = new();
}
