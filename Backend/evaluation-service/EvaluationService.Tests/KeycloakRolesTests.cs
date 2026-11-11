using EvaluationService.Security;
using Xunit;

namespace EvaluationService.Tests;

public class KeycloakRolesTests
{
    [Fact]
    public void AdminIsHigherThanEnseignantAndEtudiant()
    {
        Assert.Equal(CampusHubRoles.Admin, KeycloakRoles.GetHighest(["ETUDIANT", "ENSEIGNANT", "ADMIN"]));
    }

    [Fact]
    public void EnseignantIsHigherThanEtudiant()
    {
        Assert.Equal(CampusHubRoles.Enseignant, KeycloakRoles.GetHighest(["ETUDIANT", "ENSEIGNANT"]));
    }

    [Fact]
    public void StudentRoleIsKept()
    {
        Assert.Equal(CampusHubRoles.Etudiant, KeycloakRoles.GetHighest(["ETUDIANT", "offline_access"]));
    }

    [Fact]
    public void UnknownRolesOnly_ReturnsNull()
    {
        Assert.Null(KeycloakRoles.GetHighest(["offline_access", "uma_authorization", "default-roles-campushub"]));
    }

    [Fact]
    public void EmptyOrNullRoles_ReturnsNull()
    {
        Assert.Null(KeycloakRoles.GetHighest([]));
        Assert.Null(KeycloakRoles.GetHighest(null));
    }
}
