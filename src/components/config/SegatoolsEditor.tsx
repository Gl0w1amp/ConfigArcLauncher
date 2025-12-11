import { useTranslation } from 'react-i18next';
import SectionAccordion from './SectionAccordion';
import OptionField from './OptionField';
import { SegatoolsConfig } from '../../types/config';
import { Game } from '../../types/games';

type FieldSpec = {
  name: string;
  type: 'text' | 'number' | 'checkbox' | 'key';
  helper?: string;
};

type SectionSpec = {
  key: keyof SegatoolsConfig;
  fields: FieldSpec[];
};

type Props = {
  config: SegatoolsConfig;
  onChange: (next: SegatoolsConfig) => void;
  activeGame?: Game;
};

function getSections(gameName?: string): SectionSpec[] {
  const isChunithm = gameName === 'Chunithm';
  
  return [
  { 
    key: 'aimeio', 
    fields: [
      { name: 'path', type: 'text' }
    ] 
  },
  { 
    key: 'mai2io', 
    fields: [
      { name: 'path', type: 'text' }
    ] 
  },
  {
    key: 'aime',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'portNo', type: 'number' },
      { name: 'highBaud', type: 'checkbox' },
      { name: 'gen', type: 'number' },
      { name: 'aimePath', type: 'text' },
      { name: 'aimeGen', type: 'checkbox' },
      { name: 'felicaPath', type: 'text' },
      { name: 'felicaGen', type: 'checkbox' },
      { name: 'scan', type: 'key' },
      { name: 'proxyFlag', type: 'number' },
      { name: 'authdataPath', type: 'text' }
    ]
  },
  {
    key: 'vfd',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'portNo', type: 'number' },
      { name: 'utfConversion', type: 'checkbox' }
    ]
  },
  { key: 'amvideo', fields: [{ name: 'enable', type: 'checkbox' }] },
  {
    key: 'clock',
    fields: [
      { name: 'timezone', type: 'checkbox' },
      { name: 'timewarp', type: 'checkbox' },
      { name: 'writeable', type: 'checkbox' }
    ]
  },
  {
    key: 'dns',
    fields: [
      { name: 'default', type: 'text' },
      { name: 'title', type: 'text' },
      { name: 'router', type: 'text' },
      { name: 'startup', type: 'text' },
      { name: 'billing', type: 'text' },
      { name: 'aimedb', type: 'text' },
      { name: 'replaceHost', type: 'checkbox' },
      { name: 'startupPort', type: 'number' },
      { name: 'billingPort', type: 'number' },
      { name: 'aimedbPort', type: 'number' }
    ]
  },
  {
    key: 'ds',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'region', type: 'number' },
      { name: 'serialNo', type: 'text' }
    ]
  },
  {
    key: 'eeprom',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'path', type: 'text' }
    ]
  },
  {
    key: 'gpio',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'sw1', type: 'key' },
      { name: 'sw2', type: 'key' },
      { name: 'dipsw1', type: 'checkbox' },
      { name: 'dipsw2', type: 'checkbox' },
      { name: 'dipsw3', type: 'checkbox' },
      { name: 'dipsw4', type: 'checkbox' },
      { name: 'dipsw5', type: 'checkbox' },
      { name: 'dipsw6', type: 'checkbox' },
      { name: 'dipsw7', type: 'checkbox' },
      { name: 'dipsw8', type: 'checkbox' }
    ]
  },
  {
    key: 'gfx',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'windowed', type: 'checkbox' },
      { name: 'framed', type: 'checkbox' },
      { name: 'monitor', type: 'number' },
      { name: 'dpiAware', type: 'checkbox' }
    ]
  },
  { key: 'hwmon', fields: [{ name: 'enable', type: 'checkbox' }] },
  {
    key: 'jvs',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'foreground', type: 'checkbox' }
    ]
  },
  {
    key: 'io4',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'foreground', type: 'checkbox' },
      { name: 'test', type: 'key' },
      { name: 'service', type: 'key' },
      { name: 'coin', type: 'key' }
    ]
  },
  {
    key: 'button',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'p1Btn1', type: 'key' },
      { name: 'p1Btn2', type: 'key' },
      { name: 'p1Btn3', type: 'key' },
      { name: 'p1Btn4', type: 'key' },
      { name: 'p1Btn5', type: 'key' },
      { name: 'p1Btn6', type: 'key' },
      { name: 'p1Btn7', type: 'key' },
      { name: 'p1Btn8', type: 'key' },
      { name: 'p1Select', type: 'key' },
      { name: 'p2Btn1', type: 'key' },
      { name: 'p2Btn2', type: 'key' },
      { name: 'p2Btn3', type: 'key' },
      { name: 'p2Btn4', type: 'key' },
      { name: 'p2Btn5', type: 'key' },
      { name: 'p2Btn6', type: 'key' },
      { name: 'p2Btn7', type: 'key' },
      { name: 'p2Btn8', type: 'key' },
      { name: 'p2Select', type: 'key' },
    ]
  },
  {
    key: 'touch',
    fields: [
      { name: 'p1Enable', type: 'checkbox' },
      { name: 'p2Enable', type: 'checkbox' },
    ]
  },
  {
    key: 'keychip',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'id', type: 'text' },
      { name: 'gameId', type: 'text' },
      { name: 'platformId', type: 'text' },
      { name: 'region', type: 'number' },
      { name: 'billingCa', type: 'text' },
      { name: 'billingPub', type: 'text' },
      { name: 'billingType', type: 'number' },
      { name: 'systemFlag', type: 'number' },
      { name: 'subnet', type: 'text' }
    ]
  },
  {
    key: 'netenv',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'addrSuffix', type: 'number' },
      { name: 'routerSuffix', type: 'number' },
      { name: 'macAddr', type: 'text' }
    ]
  },
  {
    key: 'pcbid',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'serialNo', type: 'text' }
    ]
  },
  {
    key: 'sram',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'path', type: 'text' }
    ]
  },
  {
    key: 'vfs',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'amfs', type: 'text' },
      { name: 'appdata', type: 'text' },
      { name: 'option', type: 'text' }
    ]
  },
  {
    key: 'epay',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'hook', type: 'checkbox' }
    ]
  },
  {
    key: 'openssl',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'override', type: 'checkbox' }
    ]
  },
  {
    key: 'system',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'freeplay', type: 'checkbox' },
      { name: 'dipsw1', type: 'checkbox' },
      ...(isChunithm ? [
        { 
          name: 'dipsw2', 
          type: 'checkbox' as const
        },
        { 
          name: 'dipsw3', 
          type: 'checkbox' as const
        }
      ] : [])
    ]
  },
  {
    key: 'led15070',
    fields: [
      { name: 'enable', type: 'checkbox' }
    ]
  },
  {
    key: 'unity',
    fields: [
      { name: 'enable', type: 'checkbox' },
      { name: 'targetAssembly', type: 'text' }
    ]
  }
];
}

function SegatoolsEditor({ config, onChange, activeGame }: Props) {
  const { t } = useTranslation();
  const sections = getSections(activeGame?.name);

  const updateValue = (section: keyof SegatoolsConfig, field: string, value: any) => {
    onChange({
      ...config,
      [section]: {
        ...(config as any)[section],
        [field]: value
      }
    });
  };

  const visibleSections = sections.filter(section => {
    // If presentSections is available and has items, only show those sections.
    // Otherwise (e.g. new file or legacy backend), show all sections.
    if (config.presentSections && config.presentSections.length > 0) {
      return config.presentSections.includes(section.key as string);
    }
    return true;
  });

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {visibleSections.map((section) => (
        <SectionAccordion key={section.key as string} title={t([`segatools.${section.key}.sectionTitle`, `segatools.${section.key}.title`], section.key as string)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px 24px', alignItems: 'start' }}>
            {section.fields.map((field) => (
              <OptionField
                key={`${section.key}-${field.name}`}
                label={t(`segatools.${section.key}.${field.name}.label`, field.name)}
                type={field.type}
                value={(config as any)[section.key][field.name]}
                helper={field.helper}
                description={t(`segatools.${section.key}.${field.name}.desc`, '')}
                onChange={(val) => updateValue(section.key, field.name, val)}
              />
            ))}
          </div>
        </SectionAccordion>
      ))}
    </div>
  );
}

export default SegatoolsEditor;
