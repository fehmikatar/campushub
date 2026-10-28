namespace EvaluationService.Models;

// Tentative en cours d'un étudiant sur un quiz (créée par POST /api/quizzes/{id}/start).
// Supprimée à la soumission réussie ou remplacée lorsqu'elle a expiré.
public class Tentative
{
    public int Id { get; set; }

    public int QuizId { get; set; }

    // Étudiant concerné (claim "sub" du token). Simple colonne, sans clé étrangère.
    public Guid EtudiantId { get; set; }

    public DateTime DebutUtc { get; set; }
}
