using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EvaluationService.Migrations
{
    /// <inheritdoc />
    public partial class AddTentativesEtDuree : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DureeMinutes",
                table: "Quizzes",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxTentatives",
                table: "Quizzes",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "Tentatives",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    QuizId = table.Column<int>(type: "int", nullable: false),
                    EtudiantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DebutUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tentatives", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Tentatives_Quizzes_QuizId",
                        column: x => x.QuizId,
                        principalTable: "Quizzes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Resultats_QuizId",
                table: "Resultats",
                column: "QuizId");

            migrationBuilder.CreateIndex(
                name: "IX_Quizzes_CourseId",
                table: "Quizzes",
                column: "CourseId");

            migrationBuilder.CreateIndex(
                name: "IX_Tentatives_QuizId_EtudiantId",
                table: "Tentatives",
                columns: new[] { "QuizId", "EtudiantId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Tentatives");

            migrationBuilder.DropIndex(
                name: "IX_Resultats_QuizId",
                table: "Resultats");

            migrationBuilder.DropIndex(
                name: "IX_Quizzes_CourseId",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "DureeMinutes",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "MaxTentatives",
                table: "Quizzes");
        }
    }
}
