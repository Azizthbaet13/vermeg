import { describe, expect, it } from 'vitest';
import { renderVelocity } from './velocity-engine';
import { TemplateEngineService } from './template-engine.service';

describe('renderVelocity', () => {
  it('substitutes quiet and dotted references', () => {
    const html = `<p>$!{packageOffer.packageLabel} $packageOffer.policyNumber</p>`;
    const out = renderVelocity(html, {
      packageOffer: { packageLabel: 'TEMPO BASIC', policyNumber: '2508-037004' },
    });
    expect(out).toContain('TEMPO BASIC');
    expect(out).toContain('2508-037004');
  });

  it('unwraps directives hidden in HTML comments and evaluates #if', () => {
    const html = `
      <!-- #if($packageOffer.holders.insuredEntity.thirdpartyType =='PHYSICAL_PERSON' && $packageOffer.holders.insuredEntity.class.name.contains('Map') ) -->
      <b>$packageOffer.holders.insuredEntity.physicalPersonShortDesc.firstName</b>
      <!-- #end -->
    `;
    const out = renderVelocity(html, {
      packageOffer: {
        holders: {
          insuredEntity: {
            thirdpartyType: 'PHYSICAL_PERSON',
            physicalPersonShortDesc: { firstName: 'Paul' },
          },
        },
      },
    });
    expect(out).toContain('Paul');
    expect(out).not.toContain('#if');
  });

  it('formats dates with #set and substring', () => {
    const html = `
      #set($date = $packageOffer.holders.insuredEntity.physicalPersonShortDesc.birthDate)
      #set($year = $date.substring(0, 4))
      #set($month = $date.substring(5, 7))
      #set($day = $date.substring(8, 10))
      #set($formattedValue = "\${day}-\${month}-\${year}")
      <span>$formattedValue</span>
    `;
    const out = renderVelocity(html, {
      packageOffer: {
        holders: {
          insuredEntity: {
            physicalPersonShortDesc: { birthDate: '1995-04-08' },
          },
        },
      },
    });
    expect(out).toContain('08-04-1995');
  });

  it('loops questions and keeps the matching identifier', () => {
    const html = `
      #foreach($quests in $!{packageOffer.needAnalysis.needAnalysisForm.questions.questions})
        #if($!{quests.identifier}=='NDT_AmountCover')
          <td>$quests.answer.value</td>
          #break
        #end
      #end
    `;
    const out = renderVelocity(html, {
      packageOffer: {
        needAnalysis: {
          needAnalysisForm: {
            questions: {
              questions: [
                { identifier: 'NDT_NewLoan', answer: { value: 'true' } },
                { identifier: 'NDT_AmountCover', answer: { value: '15000' } },
              ],
            },
          },
        },
      },
    });
    expect(out).toContain('15000');
    expect(out).not.toContain('true');
  });

  it('fills LifeStar span id bindings instead of leaving [name]', () => {
    const html = `First name:&nbsp;<b><span id="$!{packageOffer.holders.insuredEntity.physicalPersonShortDesc.firstName}">[name]</span></b>
      Surname:&nbsp;<b><span id="$!{packageOffer.holders.insuredEntity.name}">[name] </span></b>`;
    const out = renderVelocity(html, {
      packageOffer: {
        holders: {
          insuredEntity: {
            name: 'Abella',
            physicalPersonShortDesc: { firstName: 'Paul' },
          },
        },
      },
    });
    expect(out).toContain('Paul');
    expect(out).toContain('Abella');
    expect(out).not.toContain('[name]');
  });

  it('drops leftover [label] placeholders when the bound question is missing', () => {
    const html = `Children&#39;s ages:<!-- #foreach($quests in $!{packageOffer.needAnalysis.needAnalysisForm.questions.questions})
        #if($!{quests.identifier}=='NDT_AgeChild' && $!{quests.answer.value}!="")
       --><span><b><span id="$!{quests.answer.label}">[label]</span></b></span><!--
        #end #end --> <span>;<b><span id="$!{quests.answer.label}">[label]</span></b></span>`;
    const out = renderVelocity(html, {
      packageOffer: {
        needAnalysis: {
          needAnalysisForm: {
            questions: {
              questions: [{ identifier: 'NDT_NewLoan', answer: { value: 'true' } }],
            },
          },
        },
      },
    });
    expect(out).not.toContain('[label]');
    expect(out).not.toMatch(/;\s*;/);
  });

  it('fills a matching question label from a commented #foreach', () => {
    const html = `<!-- #foreach($quests in $!{packageOffer.needAnalysis.needAnalysisForm.questions.questions})
        #if($!{quests.identifier}=='NDT_AgeChild' && $!{quests.answer.value}!="")
       --><span><b><span id="$!{quests.answer.label}">[label]</span></b></span><!--
        #end #end -->`;
    const out = renderVelocity(html, {
      packageOffer: {
        needAnalysis: {
          needAnalysisForm: {
            questions: {
              questions: [
                { identifier: 'NDT_AgeChild', answer: { value: '8', label: '8 years' } },
              ],
            },
          },
        },
      },
    });
    expect(out).toContain('8 years');
    expect(out).not.toContain('[label]');
  });

  it('removes leftover [label] spans when Velocity comments were stripped', () => {
    const html =
      "Children's ages:<span><b><span id=\"$!{quests.answer.label}\">[label]</span></b></span><span>;<b><span id=\"$!{quests.answer.label}\">[label]</span></b></span>";
    const out = renderVelocity(html, { packageOffer: {} });
    expect(out).not.toContain('[label]');
    expect(out).toContain("Children's ages:");
  });
});

describe('TemplateEngineService velocity integration', () => {
  const service = new TemplateEngineService();

  it('renders Velocity then mustache placeholders', () => {
    const html = service.substitute(
      '<p>$packageOffer.packageLabel / {{clientName}}</p>',
      { packageOffer: { packageLabel: 'TEMPO BASIC' }, clientName: 'Paul' },
    );
    expect(html).toContain('TEMPO BASIC');
    expect(html).toContain('Paul');
  });
});
