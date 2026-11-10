using System.Net;
using System.Security.Claims;
using EvaluationService.Clients;
using EvaluationService.Controllers;
using EvaluationService.Data;
using EvaluationService.Dtos;
using EvaluationService.Errors;
using EvaluationService.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EvaluationService.Tests;

public class QuizzesControllerTests
{
    private const string AuthorizationHeader = "Bearer teacher-token";

    private static QuizCreateDto ValidQuiz(int courseId = 10) => new()
    {
        Titre = "Quiz JWT",
        CourseId = courseId,
        Questions =
        [
            new QuestionCreateDto
            {
                Texte = "Qu'est-ce qu'un JWT ?",
                Reponses =
                [
                    new ReponseCreateDto { Texte = "Un token signe", EstCorrecte = true },
                    new ReponseCreateDto { Texte = "Un mot de passe", EstCorrecte = false }
                ]
            }
        ]
    };

    private static (QuizzesController Controller, AppDbContext Context) CreateController(ICourseClient courseClient)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var context = new AppDbContext(options);

        var controller = new QuizzesController(
            context,
            new NoOpEventPublisher(),
            courseClient,
            NullLogger<QuizzesController>.Instance);

        var identity = new ClaimsIdentity(
            [
                new Claim("sub", "11111111-1111-1111-1111-111111111111"),
                new Claim("role", CampusHubRoles.Enseignant)
            ],
            authenticationType: "Test");

        var httpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) };
        httpContext.Request.Headers["Authorization"] = AuthorizationHeader;

        controller.ControllerContext = new ControllerContext { HttpContext = httpContext };
        return (controller, context);
    }

    [Fact]
    public async Task Create_WhenCourseExists_CreatesQuizAndForwardsAuthorization()
    {
        var courseClient = new StubCourseClient();
        var (controller, context) = CreateController(courseClient);

        var result = await controller.Create(ValidQuiz());

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var quiz = Assert.IsType<QuizDto>(created.Value);
        Assert.Equal(10, quiz.CourseId);
        Assert.Equal(1, await context.Quizzes.CountAsync());
        Assert.Equal(1, courseClient.Calls);
        Assert.Equal(AuthorizationHeader, courseClient.AuthorizationHeader);
    }

    [Fact]
    public async Task Create_WhenCourseDoesNotExist_Returns404AndCreatesNothing()
    {
        var courseClient = new StubCourseClient { ExceptionToThrow = new CourseNotFoundException() };
        var (controller, context) = CreateController(courseClient);

        var result = await controller.Create(ValidQuiz());

        var error = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(404, error.StatusCode);
        var apiError = Assert.IsType<ApiError>(error.Value);
        Assert.Equal("Course not found", apiError.Message);
        Assert.Equal(0, await context.Quizzes.CountAsync());
    }

    [Fact]
    public async Task Create_WhenCourseServiceIsUnavailable_Returns503AndCreatesNothing()
    {
        var courseClient = new StubCourseClient { ExceptionToThrow = new CourseServiceUnavailableException() };
        var (controller, context) = CreateController(courseClient);

        var result = await controller.Create(ValidQuiz());

        var error = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(503, error.StatusCode);
        var apiError = Assert.IsType<ApiError>(error.Value);
        Assert.Equal("Course service unavailable, please retry later.", apiError.Message);
        Assert.Equal(0, await context.Quizzes.CountAsync());
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, 401)]
    [InlineData(HttpStatusCode.Forbidden, 403)]
    public async Task Create_WhenCourseRejectsTheToken_RelaysTheSameStatus(
        HttpStatusCode courseStatus,
        int expectedStatus)
    {
        var courseClient = new StubCourseClient
        {
            ExceptionToThrow = new CourseAccessDeniedException(courseStatus)
        };
        var (controller, _) = CreateController(courseClient);

        var result = await controller.Create(ValidQuiz());

        var error = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(expectedStatus, error.StatusCode);
    }

    [Fact]
    public async Task Create_WhenDtoIsInvalid_DoesNotCallCourseService()
    {
        var courseClient = new StubCourseClient();
        var (controller, _) = CreateController(courseClient);

        var result = await controller.Create(new QuizCreateDto());

        var error = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(400, error.StatusCode);
        Assert.Equal(0, courseClient.Calls);
    }
}
