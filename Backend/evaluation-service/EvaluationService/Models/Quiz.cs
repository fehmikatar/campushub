namespace EvaluationService.Models;

// Un quiz rattaché à un cours (CourseId est une référence vers le service Course).
public class Quiz
{
    public int Id { get; set; }
    public string Titre { get; set; } = string.Empty;

    // Référence vers le service Course (pas de clé étrangère SQL).
    public int CourseId { get; set; }

    // Enseignant créateur (claim "sub" du token). Simple colonne, sans clé étrangère.
    public Guid EnseignantId { get; set; }

    // Nombre maximal de résultats autorisés par étudiant (minimum 1).
    public int MaxTentatives { get; set; } = 1;

    // Durée maximale d'une tentative en minutes ; null = pas de limite.
    public int? DureeMinutes { get; set; }

    public List<Question> Questions { get; set; } = new();
}
