namespace EvaluationService.Models;

// Résultat obtenu par un étudiant après avoir passé un quiz.
public class Resultat
{
    public int Id { get; set; }

    public int QuizId { get; set; }

    // Étudiant concerné (claim "sub" du token). Simple colonne, sans clé étrangère.
    public Guid EtudiantId { get; set; }

    // Score en pourcentage (0 à 100).
    public double Score { get; set; }

    public DateTime DatePassage { get; set; }
}
