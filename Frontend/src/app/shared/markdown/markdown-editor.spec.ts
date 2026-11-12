import { TestBed } from '@angular/core/testing';
import { MarkdownEditor } from './markdown-editor';

describe('MarkdownEditor', () => {
  const setup = (initial = '') => {
    const fixture = TestBed.createComponent(MarkdownEditor);
    fixture.componentRef.setInput('value', initial);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const area = root.querySelector('textarea') as HTMLTextAreaElement;
    const button = (label: string) => root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    return { fixture, root, area, button };
  };

  it('entoure la sélection de gras', () => {
    const { fixture, area, button } = setup('un mot ici');
    area.setSelectionRange(3, 6);
    button('Gras').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('un **mot** ici');
  });

  it("insère un texte d'exemple sans sélection", () => {
    const { fixture, button } = setup('');
    button('Code').click();
    expect(fixture.componentInstance.value()).toBe('`code`');
  });

  it('transforme les lignes en liste', () => {
    const { fixture, area, button } = setup('un\ndeux');
    area.setSelectionRange(0, 7);
    button('Liste').click();
    expect(fixture.componentInstance.value()).toBe('- un\n- deux');
  });

  it('met à jour la valeur à la saisie et affiche un aperçu sûr', () => {
    const { fixture, root, area } = setup('');
    area.value = '**fort** <b>html</b>';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.preview-toggle')!.click();
    fixture.detectChanges();

    const preview = root.querySelector('.preview')!;
    expect(preview.innerHTML).toContain('<strong>fort</strong>');
    expect(preview.querySelector('b')).toBeNull();
  });
});
