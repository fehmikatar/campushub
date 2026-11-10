using System.Text.Json.Serialization;

namespace EvaluationService.Messaging;

// Enveloppe commune à tous les événements CampusHub.
public sealed class EventEnvelope
{
    [JsonPropertyName("event")]
    public string Event { get; init; } = string.Empty;

    [JsonPropertyName("occurredAt")]
    public string OccurredAt { get; init; } = string.Empty;

    [JsonPropertyName("actorId")]
    public string ActorId { get; init; } = string.Empty;

    [JsonPropertyName("data")]
    public object Data { get; init; } = new();
}
