import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import amqp from 'amqplib';

// Queue declaree par le Notification Service : on publie seulement, sans la declarer.
export const COURSE_EVENTS_QUEUE = 'course.events';

type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type Channel = Awaited<ReturnType<Connection['createChannel']>>;

// Publication "best effort" : une erreur RabbitMQ ne fait jamais echouer la requete HTTP.
// Sans RABBITMQ_URL, le service fonctionne normalement et n'envoie rien.
@Injectable()
export class EventPublisher implements OnModuleDestroy {
  private readonly log = new Logger(EventPublisher.name);
  private connection?: Connection;
  private channel?: Channel;
  private connecting?: Promise<Channel>;

  publish(event: string, actorId: string | null, data: Record<string, unknown>): void {
    if (!process.env.RABBITMQ_URL?.trim()) return;
    // Date ISO sans millisecondes, comme dans le contrat : 2026-11-10T12:00:00Z
    const occurredAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const message = { event, occurredAt, actorId, data };
    void this.send(message).catch((err: Error) =>
      this.log.warn(`Evenement ${event} non envoye : ${err.message}`),
    );
  }

  private async send(message: object) {
    const channel = await this.getChannel();
    channel.sendToQueue(COURSE_EVENTS_QUEUE, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: 'application/json',
    });
  }

  private getChannel(): Promise<Channel> {
    if (this.channel) return Promise.resolve(this.channel);
    this.connecting ??= this.connect().finally(() => (this.connecting = undefined));
    return this.connecting;
  }

  private async connect(): Promise<Channel> {
    const connection = await amqp.connect(process.env.RABBITMQ_URL!.trim());
    // Sans ces ecouteurs, une coupure de connexion ferait planter le processus.
    const reset = () => {
      this.connection = undefined;
      this.channel = undefined;
    };
    connection.on('error', (err: Error) => this.log.warn(`RabbitMQ : ${err.message}`));
    connection.on('close', reset);
    const channel = await connection.createChannel();
    channel.on('error', (err: Error) => this.log.warn(`Canal RabbitMQ : ${err.message}`));
    channel.on('close', reset);
    this.connection = connection;
    this.channel = channel;
    this.log.log('Connecte a RabbitMQ');
    return channel;
  }

  async onModuleDestroy() {
    await this.connection?.close().catch(() => undefined);
  }
}
