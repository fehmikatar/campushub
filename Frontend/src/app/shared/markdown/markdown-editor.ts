import { Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';
import { Icon } from '../icon/icon';
import { Icons } from '../icon/icons';
import { renderMarkdown } from './markdown';

/** Zone de saisie Markdown avec barre d'outils (gras, italique, code, lien, liste) et aperçu. */
@Component({
  selector: 'app-markdown-editor',
  imports: [Icon],
  template: `
    <div class="editor" [class.invalid]="invalid()">
      <div class="toolbar">
        <button type="button" title="Gras" aria-label="Gras" (click)="wrap('**', '**', 'texte')"><app-icon [name]="icons.bold" [size]="16" /></button>
        <button type="button" title="Italique" aria-label="Italique" (click)="wrap('*', '*', 'texte')"><app-icon [name]="icons.italic" [size]="16" /></button>
        <button type="button" title="Code" aria-label="Code" (click)="wrap(tick, tick, 'code')"><app-icon [name]="icons.code" [size]="16" /></button>
        <button type="button" title="Lien" aria-label="Lien" (click)="wrap('[', '](https://)', 'texte')"><app-icon [name]="icons.link" [size]="16" /></button>
        <button type="button" title="Liste" aria-label="Liste" (click)="list()"><app-icon [name]="icons.list" [size]="16" /></button>
        <button type="button" class="preview-toggle" [class.active]="preview()" (click)="preview.set(!preview())">
          {{ preview() ? 'Modifier' : 'Aperçu' }}
        </button>
      </div>
      @if (preview()) {
        <div class="md preview" [innerHTML]="html()"></div>
        @if (!value().trim()) {
          <p class="muted empty">Rien à prévisualiser.</p>
        }
      } @else {
        <textarea #area [rows]="rows()" [placeholder]="placeholder()" [value]="value()" (input)="onInput($event)"></textarea>
      }
    </div>
  `,
  styleUrl: './markdown-editor.scss',
})
export class MarkdownEditor {
  readonly value = model('');
  readonly placeholder = input('');
  readonly rows = input(6);
  readonly invalid = input(false);

  protected readonly icons = Icons;
  /** Accent grave (le caractère ne peut pas être écrit directement dans le gabarit en ligne). */
  protected readonly tick = '`';
  protected readonly preview = signal(false);
  protected readonly html = computed(() => renderMarkdown(this.value()));
  private readonly area = viewChild<ElementRef<HTMLTextAreaElement>>('area');

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }

  /** Entoure la sélection (ou un texte d'exemple) de `before` et `after`. */
  protected wrap(before: string, after: string, example: string): void {
    this.edit((text, start, end) => {
      const selected = text.slice(start, end) || example;
      return {
        text: text.slice(0, start) + before + selected + after + text.slice(end),
        selectStart: start + before.length,
        selectEnd: start + before.length + selected.length,
      };
    });
  }

  /** Transforme les lignes sélectionnées en liste à puces. */
  protected list(): void {
    this.edit((text, start, end) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const block = text.slice(lineStart, end) || 'élément';
      const bulleted = block
        .split('\n')
        .map((line) => `- ${line}`)
        .join('\n');
      return {
        text: text.slice(0, lineStart) + bulleted + text.slice(end),
        selectStart: lineStart,
        selectEnd: lineStart + bulleted.length,
      };
    });
  }

  private edit(change: (text: string, start: number, end: number) => { text: string; selectStart: number; selectEnd: number }): void {
    const element = this.area()?.nativeElement;
    if (!element) {
      return;
    }
    const result = change(this.value(), element.selectionStart, element.selectionEnd);
    this.value.set(result.text);
    element.value = result.text;
    element.focus();
    element.setSelectionRange(result.selectStart, result.selectEnd);
  }
}
