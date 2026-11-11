using System.Globalization;
using System.Text.Json;
using RabbitMQ.Client;

namespace EvaluationService.Messaging;

// Producteur RabbitMQ vers la queue "evaluation.events".
// Aucune déclaration de queue : elle appartient à notification-service.
// La publication est best effort : toute erreur est journalisée et n'échoue jamais la requête.
public sealed class RabbitMqEventPublisher : IEventPublisher, IAsyncDisposable
{
    private const string AppId = "evaluation-service";
    private static readonly TimeSpan PublishTimeout = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(30);

    private readonly ILogger<RabbitMqEventPublisher> _logger;
    private readonly ConnectionFactory? _factory;
    private readonly SemaphoreSlim _connectionLock = new(1, 1);
    private IConnection? _connection;
    private long _nextAttemptUtcTicks;

    public RabbitMqEventPublisher(IConfiguration configuration, ILogger<RabbitMqEventPublisher> logger)
    {
        _logger = logger;

        var url = configuration["RABBITMQ_URL"]?.Trim();
        if (string.IsNullOrEmpty(url))
        {
            _logger.LogInformation("RABBITMQ_URL vide : publication des événements désactivée.");
            return;
        }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "amqp" && uri.Scheme != "amqps"))
        {
            _logger.LogWarning("RABBITMQ_URL invalide : publication des événements désactivée.");
            return;
        }

        _factory = new ConnectionFactory
        {
            Uri = uri,
            AutomaticRecoveryEnabled = true,
            ClientProvidedName = AppId
        };
    }

    public async Task PublishAsync(
        string eventName,
        Guid actorId,
        object data,
        CancellationToken cancellationToken = default)
    {
        if (_factory is null || DateTime.UtcNow.Ticks < Interlocked.Read(ref _nextAttemptUtcTicks))
        {
            return;
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(PublishTimeout);

            var envelope = new EventEnvelope
            {
                Event = eventName,
                OccurredAt = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
                ActorId = actorId.ToString(),
                Data = data
            };

            var body = JsonSerializer.SerializeToUtf8Bytes(envelope);

            var connection = await GetConnectionAsync(timeout.Token);
            await using var channel = await connection.CreateChannelAsync(cancellationToken: timeout.Token);

            var properties = new BasicProperties
            {
                Persistent = true,
                ContentType = "application/json",
                ContentEncoding = "utf-8",
                Type = eventName,
                AppId = AppId,
                MessageId = Guid.NewGuid().ToString()
            };

            await channel.BasicPublishAsync(
                exchange: string.Empty,
                routingKey: MessagingContract.EvaluationQueue,
                mandatory: false,
                basicProperties: properties,
                body: body,
                cancellationToken: timeout.Token);

            _logger.LogDebug("Événement {Event} publié dans {Queue}.", eventName, MessagingContract.EvaluationQueue);
        }
        catch (Exception ex)
        {
            Interlocked.Exchange(ref _nextAttemptUtcTicks, (DateTime.UtcNow + RetryDelay).Ticks);
            await ResetConnectionAsync();
            _logger.LogDebug(ex, "Détail de l'échec de publication de {Event}.", eventName);
            _logger.LogWarning(
                "Événement {Event} non publié (RabbitMQ indisponible) : {Error}.",
                eventName,
                ex.Message);
        }
    }

    private async Task<IConnection> GetConnectionAsync(CancellationToken cancellationToken)
    {
        var connection = _connection;
        if (connection is { IsOpen: true })
        {
            return connection;
        }

        await _connectionLock.WaitAsync(cancellationToken);
        try
        {
            connection = _connection;
            if (connection is { IsOpen: true })
            {
                return connection;
            }

            if (connection is not null)
            {
                await connection.DisposeAsync();
                _connection = null;
            }

            _connection = await _factory!.CreateConnectionAsync(cancellationToken);
            return _connection;
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    private async Task ResetConnectionAsync()
    {
        await _connectionLock.WaitAsync();
        try
        {
            if (_connection is not null)
            {
                await _connection.DisposeAsync();
                _connection = null;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Fermeture de la connexion RabbitMQ ignorée.");
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _connectionLock.WaitAsync();
        try
        {
            if (_connection is not null)
            {
                await _connection.DisposeAsync();
                _connection = null;
            }
        }
        finally
        {
            _connectionLock.Release();
        }
    }
}
