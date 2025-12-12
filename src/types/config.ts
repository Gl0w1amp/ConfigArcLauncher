/**
 * Segatools configuration mirrors segatools.ini sections and keys.
 */
export interface SegatoolsConfig {
  aimeio: AimeioConfig;
  aime: AimeConfig;
  vfd: VfdConfig;
  amvideo: AmvideoConfig;
  clock: ClockConfig;
  dns: DnsConfig;
  ds: DsConfig;
  eeprom: EepromConfig;
  gpio: GpioConfig;
  gfx: GfxConfig;
  hwmon: HwmonConfig;
  jvs: JvsConfig;
  io4: Io4Config;
  keychip: KeychipConfig;
  netenv: NetenvConfig;
  pcbid: PcbidConfig;
  sram: SramConfig;
  vfs: VfsConfig;
  epay: EpayConfig;
  openssl: OpensslConfig;
  system: SystemConfig;
  led15070: Led15070Config;
  unity: UnityConfig;
  mai2io: Mai2IoConfig;
  chuniio: ChuniIoConfig;
  mu3io: Mu3IoConfig;
  button: ButtonConfig;
  touch: TouchConfig;
  led15093: Led15093Config;
  led: LedConfig;
  io3: Io3Config;
  slider: SliderConfig;
  ir: IrConfig;
  presentSections?: string[];
}

export interface SliderConfig {
  enable: boolean;
  cell1: number; cell2: number; cell3: number; cell4: number;
  cell5: number; cell6: number; cell7: number; cell8: number;
  cell9: number; cell10: number; cell11: number; cell12: number;
  cell13: number; cell14: number; cell15: number; cell16: number;
  cell17: number; cell18: number; cell19: number; cell20: number;
  cell21: number; cell22: number; cell23: number; cell24: number;
  cell25: number; cell26: number; cell27: number; cell28: number;
  cell29: number; cell30: number; cell31: number; cell32: number;
}

export interface IrConfig {
  ir1: number;
  ir2: number;
  ir3: number;
  ir4: number;
  ir5: number;
  ir6: number;
}

export interface Led15093Config { enable: boolean; }

export interface LedConfig {
  cabLedOutputPipe: boolean;
  cabLedOutputSerial: boolean;
  controllerLedOutputPipe: boolean;
  controllerLedOutputSerial: boolean;
  controllerLedOutputOpeNITHM: boolean;
  serialPort: string;
  serialBaud: number;
}

export interface ChuniIoConfig {
  path: string;
  path32: string;
  path64: string;
}

export interface Mu3IoConfig { path: string; }

export interface Io3Config {
  test: number;
  service: number;
  coin: number;
  ir: number;
}

export interface Mai2IoConfig { path: string; }

export interface ButtonConfig {
  enable: boolean;
  p1Btn1: number;
  p1Btn2: number;
  p1Btn3: number;
  p1Btn4: number;
  p1Btn5: number;
  p1Btn6: number;
  p1Btn7: number;
  p1Btn8: number;
  p1Select: number;
  p2Btn1: number;
  p2Btn2: number;
  p2Btn3: number;
  p2Btn4: number;
  p2Btn5: number;
  p2Btn6: number;
  p2Btn7: number;
  p2Btn8: number;
  p2Select: number;
}

export interface TouchConfig {
  p1Enable: boolean;
  p2Enable: boolean;
}

export interface AimeioConfig { path: string; }

export interface AimeConfig {
  enable: boolean;
  portNo: number;
  highBaud: boolean;
  gen: number;
  aimePath: string;
  aimeGen: boolean;
  felicaPath: string;
  felicaGen: boolean;
  scan: number;
  proxyFlag: number;
  authdataPath: string;
}

export interface VfdConfig {
  enable: boolean;
  portNo: number;
  utfConversion: boolean;
}

export interface AmvideoConfig { enable: boolean; }

export interface ClockConfig {
  timezone: boolean;
  timewarp: boolean;
  writeable: boolean;
}

export interface DnsConfig {
  default: string;
  title: string;
  router: string;
  startup: string;
  billing: string;
  aimedb: string;
  replaceHost: boolean;
  startupPort: number;
  billingPort: number;
  aimedbPort: number;
}

export interface DsConfig {
  enable: boolean;
  region: number;
  serialNo: string;
}

export interface EepromConfig {
  enable: boolean;
  path: string;
}

export interface GpioConfig {
  enable: boolean;
  sw1: number;
  sw2: number;
  dipsw1: boolean;
  dipsw2: boolean;
  dipsw3: boolean;
  dipsw4: boolean;
  dipsw5: boolean;
  dipsw6: boolean;
  dipsw7: boolean;
  dipsw8: boolean;
}

export interface GfxConfig {
  enable: boolean;
  windowed: boolean;
  framed: boolean;
  monitor: number;
  dpiAware: boolean;
}

export interface HwmonConfig { enable: boolean; }

export interface JvsConfig {
  enable: boolean;
  foreground: boolean;
}

export interface Io4Config {
  enable: boolean;
  foreground: boolean;
  test: number;
  service: number;
  coin: number;
}

export interface KeychipConfig {
  enable: boolean;
  id: string;
  gameId: string;
  platformId: string;
  region: number;
  billingCa: string;
  billingPub: string;
  billingType: number;
  systemFlag: number;
  subnet: string;
}

export interface NetenvConfig {
  enable: boolean;
  addrSuffix: number;
  routerSuffix: number;
  macAddr: string;
}

export interface PcbidConfig {
  enable: boolean;
  serialNo: string;
}

export interface SramConfig {
  enable: boolean;
  path: string;
}

export interface VfsConfig {
  enable: boolean;
  amfs: string;
  appdata: string;
  option: string;
}

export interface EpayConfig {
  enable: boolean;
  hook: boolean;
}

export interface OpensslConfig {
  enable: boolean;
  override: boolean;
}

export interface SystemConfig {
  enable: boolean;
  freeplay: boolean;
  dipsw1: boolean;
  dipsw2: boolean;
  dipsw3: boolean;
}

export interface Led15070Config {
  enable: boolean;
}

export interface UnityConfig {
  enable: boolean;
  targetAssembly: string;
}
