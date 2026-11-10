namespace EvaluationService.Messaging;

// Publication best effort : une erreur RabbitMQ ne doit jamais faire échouer la requête.
public interface IEventPublisher
{
    Task PublishAsync(
        string eventName,
        Guid actorId,
        object data,
        CancellationToken cancellationToken = default);
}
