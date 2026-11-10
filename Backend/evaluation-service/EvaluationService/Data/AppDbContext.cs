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
    public DbSet<Tentative> Tentatives => Set<Tentative>();

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

        // Tentative -> Quiz : une suppression de quiz supprime ses tentatives en cours.
        modelBuilder.Entity<Tentative>()
            .HasOne<Quiz>()
            .WithMany()
            .HasForeignKey(t => t.QuizId)
            .OnDelete(DeleteBehavior.Cascade);

        // Valeur par défaut en base pour les quiz existants et les insertions hors API.
        modelBuilder.Entity<Quiz>()
            .Property(q => q.MaxTentatives)
            .HasDefaultValue(1);

        // Index pour retrouver rapidement les quiz d'un cours et les résultats d'un quiz.
        modelBuilder.Entity<Quiz>()
            .HasIndex(q => q.CourseId);

        modelBuilder.Entity<Resultat>()
            .HasIndex(r => r.QuizId);

        // Index pour retrouver rapidement les résultats d'un étudiant sur un quiz
        // (index non unique : plusieurs tentatives sont autorisées).
        modelBuilder.Entity<Resultat>()
            .HasIndex(r => new { r.EtudiantId, r.QuizId });

        // Index pour retrouver la tentative en cours d'un étudiant sur un quiz.
        modelBuilder.Entity<Tentative>()
            .HasIndex(t => new { t.QuizId, t.EtudiantId });
    }
}
