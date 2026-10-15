package com.campushub.userservice.user;

import com.campushub.userservice.exception.BadRequestException;
import com.campushub.userservice.exception.ConflictException;
import com.campushub.userservice.exception.ForbiddenOperationException;
import com.campushub.userservice.security.PasswordPolicy;
import com.campushub.userservice.support.EntityIdSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminUserServiceTest {

    private static final UUID ADMIN_ID = UUID.randomUUID();

    private UserRepository userRepository;
    private MatriculeGenerator matriculeGenerator;
    private BCryptPasswordEncoder passwordEncoder;
    private AdminUserService service;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        when(userRepository.save(any())).thenAnswer(inv -> {
            User saved = inv.getArgument(0);
            EntityIdSupport.assignId(saved, UUID.randomUUID());
            return saved;
        });
        matriculeGenerator = mock(MatriculeGenerator.class);
        when(matriculeGenerator.next()).thenReturn("ETU20260001", "ETU20260002", "ETU20260003");
        passwordEncoder = new BCryptPasswordEncoder();
        service = new AdminUserService(userRepository, passwordEncoder, new PasswordPolicy(), matriculeGenerator);
    }

    // -------------------------------------------------------------------------------------
    // Approval
    // -------------------------------------------------------------------------------------

    @Test
    void approvingAPendingStudentGeneratesTheMatriculeAndActivatesTheAccount() {
        User student = existing(Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);

        User approved = service.approve(ADMIN_ID, student.getId());

        assertThat(approved.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(approved.getMatricule()).isEqualTo("ETU20260001");
        assertThat(approved.getId()).isEqualTo(student.getId());
    }

    @Test
    void eachApprovalGetsTheNextUniqueMatricule() {
        User first = existing(Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);
        User second = existing(Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);

        service.approve(ADMIN_ID, first.getId());
        service.approve(ADMIN_ID, second.getId());

        assertThat(first.getMatricule()).isNotEqualTo(second.getMatricule());
    }

    @Test
    void anAlreadyApprovedStudentCannotBeApprovedAgain() {
        User student = existing(Role.ETUDIANT, AccountStatus.ACTIVE);

        assertThatThrownBy(() -> service.approve(ADMIN_ID, student.getId())).isInstanceOf(BadRequestException.class);
        verify(matriculeGenerator, never()).next();
    }

    @Test
    void onlyStudentsCanBeApproved() {
        User teacher = existing(Role.ENSEIGNANT, AccountStatus.ACTIVE);

        assertThatThrownBy(() -> service.approve(ADMIN_ID, teacher.getId())).isInstanceOf(BadRequestException.class);
    }

    // -------------------------------------------------------------------------------------
    // Creation
    // -------------------------------------------------------------------------------------

    @Test
    void createsAnActiveTeacherWithItsSpecialite() {
        User teacher = service.create(ADMIN_ID, newUser(Role.ENSEIGNANT, "Informatique", null));

        assertThat(teacher.getRole()).isEqualTo(Role.ENSEIGNANT);
        assertThat(teacher.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(teacher.getSpecialite()).isEqualTo("Informatique");
        assertThat(teacher.getMatricule()).isNull();
        assertThat(passwordEncoder.matches("initial-password-123", teacher.getPasswordHash())).isTrue();
    }

    @Test
    void createsAnActiveAdministratorWithItsService() {
        User admin = service.create(ADMIN_ID, newUser(Role.ADMIN, null, "Scolarite"));

        assertThat(admin.getRole()).isEqualTo(Role.ADMIN);
        assertThat(admin.getService()).isEqualTo("Scolarite");
    }

    @Test
    void anAdministratorAccountRequiresItsAdministrativeDepartment() {
        assertThatThrownBy(() -> service.create(ADMIN_ID, newUser(Role.ADMIN, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("service");
        assertThatThrownBy(() -> service.create(ADMIN_ID, newUser(Role.ADMIN, null, "   ")))
                .isInstanceOf(BadRequestException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void aStudentCreatedByAnAdministratorIsActiveWithAGeneratedMatricule() {
        User student = service.create(ADMIN_ID, newUser(Role.ETUDIANT, null, null));

        assertThat(student.getStatus()).isEqualTo(AccountStatus.ACTIVE);
        assertThat(student.getMatricule()).isEqualTo("ETU20260001");
    }

    @Test
    void anAttributeOfAnotherRoleIsRejected() {
        assertThatThrownBy(() -> service.create(ADMIN_ID, newUser(Role.ETUDIANT, "Informatique", null)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.create(ADMIN_ID, newUser(Role.ENSEIGNANT, null, "Scolarite")))
                .isInstanceOf(BadRequestException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void aDuplicateEmailIsAConflict() {
        when(userRepository.existsByEmail("jean.dupont@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.create(ADMIN_ID, newUser(Role.ENSEIGNANT, null, null)))
                .isInstanceOf(ConflictException.class);
    }

    // -------------------------------------------------------------------------------------
    // Role changes
    // -------------------------------------------------------------------------------------

    @Test
    void anAdministratorCannotChangeTheirOwnRole() {
        assertThatThrownBy(() -> service.changeRole(ADMIN_ID, ADMIN_ID, Role.ETUDIANT, null, null))
                .isInstanceOf(ForbiddenOperationException.class);
    }

    @Test
    void studentToTeacherClearsTheMatriculeAndKeepsTheId() {
        User student = existing(Role.ETUDIANT, AccountStatus.ACTIVE);
        UUID id = student.getId();

        service.changeRole(ADMIN_ID, id, Role.ENSEIGNANT, "Physique", null);

        assertThat(student.getId()).isEqualTo(id);
        assertThat(student.getRole()).isEqualTo(Role.ENSEIGNANT);
        assertThat(student.getMatricule()).isNull();
        assertThat(student.getSpecialite()).isEqualTo("Physique");
    }

    @Test
    void teacherToStudentClearsTheSpecialiteAndGeneratesAMatricule() {
        User teacher = existing(Role.ENSEIGNANT, AccountStatus.ACTIVE);
        teacher.changeSpecialite("Physique");

        service.changeRole(ADMIN_ID, teacher.getId(), Role.ETUDIANT, null, null);

        assertThat(teacher.getSpecialite()).isNull();
        assertThat(teacher.getMatricule()).isEqualTo("ETU20260001");
    }

    @Test
    void aPendingRegistrationMustBeApprovedBeforeItsRoleChanges() {
        User pending = existing(Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);

        assertThatThrownBy(() -> service.changeRole(ADMIN_ID, pending.getId(), Role.ADMIN, null, null))
                .isInstanceOf(BadRequestException.class);
        assertThat(pending.getRole()).isEqualTo(Role.ETUDIANT);
    }

    @Test
    void aMismatchedAttributeOnRoleChangeIsRejectedWithoutConsumingAMatricule() {
        User teacher = existing(Role.ENSEIGNANT, AccountStatus.ACTIVE);

        assertThatThrownBy(() -> service.changeRole(ADMIN_ID, teacher.getId(), Role.ETUDIANT, "Physique", null))
                .isInstanceOf(BadRequestException.class);
        verify(matriculeGenerator, never()).next();
    }

    // -------------------------------------------------------------------------------------
    // Status
    // -------------------------------------------------------------------------------------

    @Test
    void suspendAndReactivate() {
        User teacher = existing(Role.ENSEIGNANT, AccountStatus.ACTIVE);

        service.changeStatus(ADMIN_ID, teacher.getId(), AccountStatus.SUSPENDED);
        assertThat(teacher.getStatus()).isEqualTo(AccountStatus.SUSPENDED);

        service.changeStatus(ADMIN_ID, teacher.getId(), AccountStatus.ACTIVE);
        assertThat(teacher.getStatus()).isEqualTo(AccountStatus.ACTIVE);
    }

    @Test
    void anAdministratorCannotChangeTheirOwnStatus() {
        assertThatThrownBy(() -> service.changeStatus(ADMIN_ID, ADMIN_ID, AccountStatus.SUSPENDED))
                .isInstanceOf(ForbiddenOperationException.class);
    }

    @Test
    void thePendingStatusIsLeftOnlyThroughApproval() {
        User pending = existing(Role.ETUDIANT, AccountStatus.PENDING_APPROVAL);
        User active = existing(Role.ETUDIANT, AccountStatus.ACTIVE);

        assertThatThrownBy(() -> service.changeStatus(ADMIN_ID, pending.getId(), AccountStatus.ACTIVE))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.changeStatus(ADMIN_ID, active.getId(), AccountStatus.PENDING_APPROVAL))
                .isInstanceOf(BadRequestException.class);
        assertThat(pending.getMatricule()).isNull();
    }

    // -------------------------------------------------------------------------------------
    // Profile edit
    // -------------------------------------------------------------------------------------

    @Test
    void editKeepsAnOmittedSpecialiteAndClearsABlankOne() {
        User teacher = existing(Role.ENSEIGNANT, AccountStatus.ACTIVE);
        teacher.changeSpecialite("Physique");

        service.update(ADMIN_ID, teacher.getId(), "Dupont", "Jean", teacher.getEmail(), null, null);
        assertThat(teacher.getSpecialite()).isEqualTo("Physique");
        assertThat(teacher.getNom()).isEqualTo("Dupont");

        service.update(ADMIN_ID, teacher.getId(), "Dupont", "Jean", teacher.getEmail(), "", null);
        assertThat(teacher.getSpecialite()).isNull();
    }

    @Test
    void editingTheEmailChecksItIsFree() {
        User teacher = existing(Role.ENSEIGNANT, AccountStatus.ACTIVE);
        when(userRepository.existsByEmail("taken@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.update(ADMIN_ID, teacher.getId(), "Dupont", "Jean", "Taken@Example.com", null, null))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void listingClampsThePageSizeAndFiltersByStatus() {
        when(userRepository.findByStatus(eq(AccountStatus.PENDING_APPROVAL), any(Pageable.class)))
                .thenAnswer(inv -> new PageImpl<User>(List.of(), inv.getArgument(1), 0));

        var page = service.list(null, AccountStatus.PENDING_APPROVAL, -1, 10_000);

        assertThat(page.getSize()).isEqualTo(AdminUserService.MAX_PAGE_SIZE);
        assertThat(page.getNumber()).isZero();
    }

    private User existing(Role role, AccountStatus status) {
        User user = new User(UUID.randomUUID() + "@example.com", "hash", "Martin", "Alice", role, status);
        if (role == Role.ETUDIANT && status != AccountStatus.PENDING_APPROVAL) {
            user.changeRole(role, "ETU20250099", null, null);
        }
        EntityIdSupport.assignId(user, UUID.randomUUID());
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        return user;
    }

    private AdminUserService.NewUser newUser(Role role, String specialite, String serviceName) {
        return new AdminUserService.NewUser("Jean.Dupont@example.com", "initial-password-123", role, "Dupont", "Jean",
                specialite, serviceName);
    }

}
