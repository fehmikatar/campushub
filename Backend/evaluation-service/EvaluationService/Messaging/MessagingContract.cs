namespace EvaluationService.Messaging;

// Contrat partagé avec notification-service (seul consommateur).
public static class MessagingContract
{
    // Queue durable déclarée exclusivement par notification-service.
    public const string EvaluationQueue = "evaluation.events";

    public static class Events
    {
        public const string QuizCreated = "quiz.created";
        public const string QuizSubmitted = "quiz.submitted";
    }
}
