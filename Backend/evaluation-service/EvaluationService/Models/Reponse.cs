namespace EvaluationService.Models;

// Une réponse possible à une question. EstCorrecte n'est jamais exposée aux étudiants.
public class Reponse
{
    public int Id { get; set; }
    public string Texte { get; set; } = string.Empty;
    public bool EstCorrecte { get; set; }

    public int QuestionId { get; set; }
}
