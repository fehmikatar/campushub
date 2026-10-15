namespace EvaluationService.Models;

// Résultat obtenu par un étudiant après avoir passé un quiz.
public class Resultat
{
    public int Id { get; set; }

    public int QuizId { get; set; }

    // Référence vers le service User (pas de clé étrangère SQL).
    public int UserId { get; set; }

    // Score en pourcentage (0 à 100).
    public double Score { get; set; }

    public DateTime DatePassage { get; set; }
}
