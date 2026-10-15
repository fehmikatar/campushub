using EvaluationService.Models;
using Microsoft.EntityFrameworkCore;

namespace EvaluationService.Data;

// Contexte EF Core du service Evaluation.
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Quiz> Quizzes => Set<Quiz>();
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<Reponse> Reponses => Set<Reponse>();
    public DbSet<Resultat> Resultats => Set<Resultat>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Quiz -> Questions : suppression en cascade.
        modelBuilder.Entity<Question>()
            .HasOne<Quiz>()
            .WithMany(q => q.Questions)
            .HasForeignKey(q => q.QuizId)
            .OnDelete(DeleteBehavior.Cascade);

        // Question -> Réponses : suppression en cascade.
        modelBuilder.Entity<Reponse>()
            .HasOne<Question>()
            .WithMany(q => q.Reponses)
            .HasForeignKey(r => r.QuestionId)
            .OnDelete(DeleteBehavior.Cascade);

        // Index pour retrouver rapidement les résultats d'un étudiant sur un quiz.
        modelBuilder.Entity<Resultat>()
            .HasIndex(r => new { r.UserId, r.QuizId });
    }
}
