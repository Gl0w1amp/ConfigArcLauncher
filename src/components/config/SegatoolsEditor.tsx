import { useTranslation } from 'react-i18next';
import SectionAccordion from './SectionAccordion';
import OptionField from './OptionField';
import { SegatoolsConfig } from '../../types/config';
import { Game } from '../../types/games';

type FieldSpec = {
  name: string;
  type: 'text' | 'number' | 'checkbox' | 'key';
  helper?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
};

type SectionSpec = {
  key: keyof SegatoolsConfig;
  fields: FieldSpec[];
};

type Props = {
  config: SegatoolsConfig;
  onChange: (next: SegatoolsConfig) => void;
  activeGame?: Game;
  advanced?: boolean;
};

const ALL_SECTIONS: SectionSpec[] = [
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
      { 
        name: 'default', 
        type: 'text',
        options: [
          { label: 'AquaDX', value: 'aquadx.hydev.org' },
          { label: 'RinNET', value: 'aqua.naominet.live' },
          { label: 'Localhost', value: '127.0.0.1' }
        ]
      },
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
      { name: 'id', type: 'text', required: true },
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
      { name: 'amfs', type: 'text', required: true },
      { name: 'appdata', type: 'text', required: true },
      { name: 'option', type: 'text', required: true }
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
      { 
        name: 'dipsw2', 
        type: 'checkbox' as const
      },
      { 
        name: 'dipsw3', 
        type: 'checkbox' as const
      }
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
  },
  {
    key: 'led15093',
    fields: [
      { name: 'enable', type: 'checkbox' }
    ]
  },
  {
    key: 'led',
    fields: [
      { name: 'cabLedOutputPipe', type: 'checkbox' },
      { name: 'cabLedOutputSerial', type: 'checkbox' },
      { name: 'controllerLedOutputPipe', type: 'checkbox' },
      { name: 'controllerLedOutputSerial', type: 'checkbox' },
      { name: 'controllerLedOutputOpeNITHM', type: 'checkbox' },
      { name: 'serialPort', type: 'text' },
      { name: 'serialBaud', type: 'number' }
    ]
  },
  {
    key: 'chuniio',
    fields: [
      { name: 'path', type: 'text' },
      { name: 'path32', type: 'text' },
      { name: 'path64', type: 'text' }
    ]
  },
  {
    key: 'mu3io',
    fields: [
      { name: 'path', type: 'text' }
    ]
  },
  {
    key: 'io3',
    fields: [
      { name: 'test', type: 'key' },
      { name: 'service', type: 'key' },
      { name: 'coin', type: 'key' },
      { name: 'ir', type: 'key' }
    ]
  },
  {
    key: 'slider',
    fields: [
      { name: 'enable', type: 'checkbox' },
      ...Array.from({ length: 32 }, (_, i) => ({
        name: `cell${i + 1}`,
        type: 'key' as const
      }))
    ]
  },
  {
    key: 'ir',
    fields: Array.from({ length: 6 }, (_, i) => ({
      name: `ir${i + 1}`,
      type: 'key' as const
    }))
  }
];

function allowedSections(gameName?: string): Set<string> {
  const blacklist = blacklistedSections(gameName);
  const filterBlacklisted = (sections: string[]) => sections.filter((s) => !blacklist.has(s));
  const common = [
    'aimeio', 'aime', 'vfd', 'amvideo', 'clock', 'dns', 'ds', 'eeprom', 'gpio', 'hwmon',
    'jvs', 'keychip', 'netenv', 'pcbid', 'sram', 'vfs', 'epay', 'openssl', 'system',
  ];

  switch (gameName) {
    case 'Chunithm':
      return new Set(filterBlacklisted([
        ...common,
        'gfx', 'led15093', 'led', 'chuniio', 'io3', 'ir', 'slider',
      ]));
    case 'Sinmai':
      return new Set(filterBlacklisted([
        ...common,
        'led15070', 'unity', 'mai2io', 'io4', 'button', 'touch', 'gfx',
      ]));
    case 'Ongeki':
      return new Set(filterBlacklisted([
        ...common,
        'gfx', 'unity', 'led15093', 'led', 'mu3io', 'io4',
      ]));
    default:
      return new Set(filterBlacklisted(ALL_SECTIONS.map(s => s.key as string)));
  }
}

function blacklistedSections(_gameName?: string): Set<string> {
  // Global blacklist for now; extend per-game if needed.
  return new Set(['ds', 'eeprom', 'gpio', 'jvs']);
}

function getSections(gameName?: string): SectionSpec[] {
  const allowed = allowedSections(gameName);
  const isChunithm = gameName === 'Chunithm';

  return ALL_SECTIONS
    .filter(section => allowed.has(section.key as string))
    .map(section => {
      if (section.key === 'system' && !isChunithm) {
        return {
          ...section,
          fields: section.fields.filter(f => !['dipsw2', 'dipsw3'].includes(f.name)),
        };
      }
      return section;
    });
}

function SegatoolsEditor({ config, onChange, activeGame, advanced = false }: Props) {
  const { t } = useTranslation();
  const allowed = allowedSections(activeGame?.name);
  const sections = getSections(activeGame?.name);
  const presentSections = (config.presentSections ?? [])
    .map((s) => s.toLowerCase())
    .filter((s) => allowed.has(s));
  const shouldFilterSections = presentSections.length > 0 && !advanced;
  const presentKeys = (config.presentKeys ?? []).map((k) => k.toLowerCase());
  const commentedKeys = (config.commentedKeys ?? []).map((k) => k.toLowerCase());

  const updateValue = (section: keyof SegatoolsConfig, field: string, value: any) => {
    // Ensure the section is marked as present when modified
    let newPresentSections = config.presentSections;
    if (newPresentSections && !newPresentSections.includes(section as string)) {
      newPresentSections = [...newPresentSections, section as string];
    }

    onChange({
      ...config,
      presentSections: newPresentSections,
      [section]: {
        ...(config as any)[section],
        [field]: value
      }
    });
  };

  const effectiveSections = shouldFilterSections ? presentSections : Array.from(allowed);
  const visibleSections = sections.filter(section =>
    effectiveSections.includes((section.key as string).toLowerCase())
  );

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {visibleSections.map((section) => (
        <SectionAccordion key={section.key as string} title={t([`segatools.${section.key}.sectionTitle`, `segatools.${section.key}.title`], section.key as string)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px 24px', alignItems: 'start' }}>
            {section.fields.map((field) => {
              const fullKey = `${section.key}.${field.name}`;
              const isCommented = config.commentedKeys?.includes(fullKey);
              const lowerFullKey = fullKey.toLowerCase();
              const shouldShowField =
                !shouldFilterSections ||
                presentKeys.includes(lowerFullKey) ||
                commentedKeys.includes(lowerFullKey);
              if (!shouldShowField) {
                return null;
              }
              
              return (
                <OptionField
                  key={`${section.key}-${field.name}`}
                  label={t(`segatools.${section.key}.${field.name}.label`, field.name)}
                  type={field.type}
                  value={(config as any)[section.key][field.name]}
                  helper={field.helper}
                  description={t(`segatools.${section.key}.${field.name}.desc`, '')}
                  onChange={(val) => updateValue(section.key, field.name, val)}
                  required={field.required}
                  options={field.options}
                  commented={isCommented}
                  onUncomment={() => {
                    const newCommentedKeys = config.commentedKeys?.filter(k => k !== fullKey) || [];
                    onChange({
                      ...config,
                      commentedKeys: newCommentedKeys
                    });
                  }}
                />
              );
            })}
          </div>
        </SectionAccordion>
      ))}
    </div>
  );
}

export default SegatoolsEditor;
