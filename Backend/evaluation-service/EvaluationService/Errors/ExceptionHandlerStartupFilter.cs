using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace EvaluationService.Errors;

// Le framework ajoute la page d'erreur de développement avant les middlewares de Program.
// Ce filtre place le gestionnaire CampusHub en amont pour qu'aucune stack trace ne fuite.
public sealed class ExceptionHandlerStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        => app =>
        {
            app.UseExceptionHandler();
            next(app);
        };
}
