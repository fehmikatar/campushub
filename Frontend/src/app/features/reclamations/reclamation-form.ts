import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { errorMessage, fieldErrors } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { Icon } from '../../shared/icon/icon';
import { IconData } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  Category,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  MODULE_MAX,
  Reclamation,
  SUBJECT_MAX,
  SUBJECT_MIN,
  currentAcademicYear,
} from './reclamation.model';
import { ReclamationsService } from './reclamations.service';

/** Année « 2026-2027 » : deux années consécutives. */
function academicYearValidator(control: AbstractControl): ValidationErrors | null {
  const match = /^(\d{4})-(\d{4})$/.exec(control.value ?? '');
  return match && Number(match[2]) === Number(match[1]) + 1 ? null : { academicYear: true };
}

/** Écrans 3 et 5 : nouvelle réclamation, ou modification tant qu'elle est « Nouvelle ». */
@Component({
  selector: 'app-reclamation-form',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './reclamation-form.html',
  styleUrl: './reclamation-form.scss',
})
export class ReclamationForm {
  private readonly api = inject(ReclamationsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly icons = Icons;
  protected readonly categories = CATEGORIES;
  protected readonly labels = CATEGORY_LABELS;
  protected readonly limits = { subjectMin: SUBJECT_MIN, subjectMax: SUBJECT_MAX, descMin: DESCRIPTION_MIN, descMax: DESCRIPTION_MAX, module: MODULE_MAX };
  protected readonly categoryIcons: Record<Category, IconData> = {
    grade: Icons.award,
    exam: Icons.clipboardList,
    absence: Icons.calendarX,
    registration: Icons.userCheck,
    internship: Icons.briefcase,
    administrative: Icons.landmark,
    other: Icons.circleHelp,
  };

  protected readonly editId = this.route.snapshot.paramMap.get('id');
  protected readonly editing = this.editId !== null;
  protected readonly original = signal<Reclamation | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<string, string>>({});
  protected readonly created = signal<Reclamation | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    category: ['' as Category | '', Validators.required],
    subject: ['', [Validators.required, Validators.minLength(SUBJECT_MIN), Validators.maxLength(SUBJECT_MAX)]],
    module: ['', Validators.maxLength(MODULE_MAX)],
    academic_year: [currentAcademicYear(), [Validators.required, academicYearValidator]],
    description: ['', [Validators.required, Validators.minLength(DESCRIPTION_MIN), Validators.maxLength(DESCRIPTION_MAX)]],
  });

  protected readonly subjectLength = computed(() => this.form.controls.subject.value.length);
  protected readonly descriptionLength = computed(() => this.form.controls.description.value.length);
  /** Seule une réclamation « Nouvelle » se modifie. */
  protected readonly locked = computed(() => this.editing && this.original() !== null && this.original()!.status !== 'new');

  constructor() {
    if (this.editId) {
      this.form.controls.academic_year.disable(); // l'année ne se modifie pas
      this.api.get(this.editId).subscribe({
        next: (reclamation) => {
          this.original.set(reclamation);
          this.form.patchValue({
            category: reclamation.category,
            subject: reclamation.subject,
            module: reclamation.module,
            academic_year: reclamation.academic_year,
            description: reclamation.description,
          });
        },
        error: () => this.loadFailed.set(true),
      });
    }
  }

  protected select(category: Category): void {
    this.form.controls.category.setValue(category);
    this.form.controls.category.markAsTouched();
  }

  protected invalid(name: keyof ReturnType<typeof this.form.getRawValue>): boolean {
    const control = this.form.controls[name];
    return (control.touched || this.submitted()) && control.invalid;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.saving() || this.locked()) {
      this.form.markAllAsTouched();
      return;
    }
    const { category, subject, module, academic_year, description } = this.form.getRawValue();
    const body = { category: category as Category, subject: subject.trim(), module: module.trim(), description: description.trim() };
    this.saving.set(true);
    this.error.set(null);
    this.serverErrors.set({});

    const request = this.editId ? this.api.update(this.editId, body) : this.api.create({ ...body, academic_year });
    request.subscribe({
      next: (reclamation) => {
        this.saving.set(false);
        if (this.editId) {
          this.toast.success('Votre réclamation a été modifiée.');
          void this.router.navigate(['/reclamations', reclamation.id]);
        } else {
          this.created.set(reclamation);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.serverErrors.set(fieldErrors(error));
        this.error.set(errorMessage(error, "Impossible d'enregistrer la demande. Veuillez réessayer."));
      },
    });
  }
}
