use crate::error::ConfigError;
use configparser::ini::Ini;
use std::fs;
use std::path::Path;
use std::collections::HashSet;

pub mod paths;
pub mod profiles;
pub mod segatools;
pub mod templates;
pub mod json_configs;

pub use segatools::SegatoolsConfig;

fn parse_bool(val: &str) -> Option<bool> {
  match val.trim().to_lowercase().as_str() {
    "1" | "true" | "yes" => Some(true),
    "0" | "false" | "no" => Some(false),
    _ => None,
  }
}

fn parse_u32(val: &str) -> Option<u32> {
  let trimmed = val.trim();
  if let Some(hex) = trimmed.strip_prefix("0x") {
    u32::from_str_radix(hex, 16).ok()
  } else {
    trimmed.parse::<u32>().ok()
  }
}

fn read_bool(parser: &Ini, section: &str, key: &str, default: bool) -> bool {
  parser
    .get(section, key)
    .and_then(|v| parse_bool(&v))
    .unwrap_or(default)
}

fn read_u32(parser: &Ini, section: &str, key: &str, default: u32) -> u32 {
  parser
    .get(section, key)
    .and_then(|v| parse_u32(&v))
    .unwrap_or(default)
}

fn read_string(parser: &Ini, section: &str, key: &str, default: &str) -> String {
  parser
    .get(section, key)
    .unwrap_or_else(|| default.to_string())
}

fn bool_to_string(val: bool) -> String {
  if val { "1".to_string() } else { "0".to_string() }
}

trait ConfigWriter {
    fn write_val(&mut self, section: &str, key: &str, value: &str);
    fn handle_skip(&mut self, section: &str, key: &str);
}

impl ConfigWriter for Ini {
    fn write_val(&mut self, section: &str, key: &str, value: &str) {
        self.set(section, key, Some(value.to_string()));
    }
    fn handle_skip(&mut self, _section: &str, _key: &str) {
        // Do nothing
    }
}

struct IniUpdater {
    lines: Vec<String>,
}

impl IniUpdater {
    fn new(content: &str) -> Self {
        Self {
            lines: content.lines().map(|s| s.to_string()).collect(),
        }
    }

    fn find_section_line(&self, section: &str) -> Option<usize> {
        let section_header = format!("[{}]", section);
        for (i, line) in self.lines.iter().enumerate() {
            if line.trim().eq_ignore_ascii_case(&section_header) {
                return Some(i);
            }
        }
        None
    }

    fn set(&mut self, section: &str, key: &str, value: &str) {
        if let Some(section_idx) = self.find_section_line(section) {
            let mut insert_idx = section_idx + 1;
            let mut found = false;
            
            for i in (section_idx + 1)..self.lines.len() {
                let line = &self.lines[i];
                let trimmed = line.trim();
                if trimmed.starts_with('[') && trimmed.ends_with(']') {
                    insert_idx = i;
                    break;
                }
                
                if let Some((k, _)) = parse_line_key(line) {
                    if k.eq_ignore_ascii_case(key) {
                        self.lines[i] = format!("{}={}", key, value);
                        found = true;
                        break;
                    }
                }
                insert_idx = i + 1;
            }
            
            if !found {
                self.lines.insert(insert_idx, format!("{}={}", key, value));
            }
        } else {
            if !self.lines.is_empty() && !self.lines.last().unwrap().trim().is_empty() {
                self.lines.push("".to_string());
            }
            self.lines.push(format!("[{}]", section));
            self.lines.push(format!("{}={}", key, value));
        }
    }

    fn comment_out(&mut self, section: &str, key: &str) {
        if let Some(section_idx) = self.find_section_line(section) {
             for i in (section_idx + 1)..self.lines.len() {
                let line = &self.lines[i];
                let trimmed = line.trim();
                if trimmed.starts_with('[') && trimmed.ends_with(']') {
                    break;
                }
                
                if let Some((k, is_commented)) = parse_line_key(line) {
                    if k.eq_ignore_ascii_case(key) {
                        if !is_commented {
                            self.lines[i] = format!(";{}", line);
                        }
                        return;
                    }
                }
            }
        }
    }
    
    fn to_string(&self) -> String {
        self.lines.join("\n")
    }
}

impl ConfigWriter for IniUpdater {
    fn write_val(&mut self, section: &str, key: &str, value: &str) {
        self.set(section, key, value);
    }
    fn handle_skip(&mut self, section: &str, key: &str) {
        self.comment_out(section, key);
    }
}

fn parse_line_key(line: &str) -> Option<(String, bool)> {
    let trimmed = line.trim();
    if trimmed.is_empty() { return None; }
    
    let mut is_commented = false;
    let mut content = trimmed;
    
    if content.starts_with(';') || content.starts_with('#') {
        is_commented = true;
        content = &content[1..].trim();
    }
    
    if let Some(idx) = content.find('=') {
        let key = content[..idx].trim();
        return Some((key.to_string(), is_commented));
    }
    None
}

fn prune_existing_content(content: &str, cfg: &SegatoolsConfig) -> String {
  if cfg.present_keys.is_empty() || cfg.present_sections.is_empty() {
    return content.to_string();
  }

  let allowed: HashSet<String> = cfg
    .present_keys
    .iter()
    .map(|k| k.to_lowercase())
    .collect();
  let managed_sections: HashSet<String> = cfg
    .present_sections
    .iter()
    .map(|s| s.to_lowercase())
    .collect();

  let mut lines = Vec::new();
  let mut current_section = String::new();

  for line in content.lines() {
    let trimmed = line.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
      current_section = trimmed[1..trimmed.len() - 1].trim().to_lowercase();
      lines.push(line.to_string());
      continue;
    }

    if let Some((key, _)) = parse_line_key(line) {
      if !current_section.is_empty() && managed_sections.contains(&current_section) {
        let full_key = format!("{}.{}", current_section, key.to_lowercase());
        if !allowed.contains(&full_key) {
          continue;
        }
      }
    }

    lines.push(line.to_string());
  }

  lines.join("\n")
}

fn should_write_key(present_keys: &[String], section: &str, key: &str) -> bool {
  if present_keys.is_empty() {
    return true;
  }
  let full_key = format!("{}.{}", section.to_lowercase(), key.to_lowercase());
  present_keys.contains(&full_key)
}

fn save_section(
  writer: &mut dyn ConfigWriter,
  name: &str,
  data: Vec<(&str, String)>,
  commented_keys: &[String],
  present_keys: &[String],
) {
  for (k, v) in data {
    if !should_write_key(present_keys, name, k) {
      continue;
    }
    let full_key = format!("{}.{}", name, k);
    let is_commented = commented_keys.contains(&full_key);
    let mut should_skip = v.is_empty() || is_commented;

    if !should_skip && v == "0" {
      if name == "slider" && k != "enable" {
        should_skip = true;
      }
      if name == "ir" {
        should_skip = true;
      }
      if name == "dns" && (k == "startupPort" || k == "billingPort" || k == "aimedbPort") {
        should_skip = true;
      }
    }

    if should_skip {
        writer.handle_skip(name, k);
    } else {
        writer.write_val(name, k, &v);
    }
  }
}

fn perform_save(writer: &mut dyn ConfigWriter, cfg: &SegatoolsConfig) {
  let should_save = |name: &str| -> bool {
    if cfg.present_sections.is_empty() {
      return true;
    }
    cfg.present_sections.contains(&name.to_lowercase())
  };

  let mut save_helper = |name: &str, data: Vec<(&str, String)>| {
      save_section(writer, name, data, &cfg.commented_keys, &cfg.present_keys);
  };

  if should_save("aimeio") {
    save_helper("aimeio",
      vec![("path", cfg.aimeio.path.clone())],
    );
  }

  if should_save("aime") {
    save_helper("aime",
      vec![
        ("enable", bool_to_string(cfg.aime.enable)),
        ("portNo", cfg.aime.port_no.to_string()),
        ("highBaud", bool_to_string(cfg.aime.high_baud)),
        ("gen", cfg.aime.gen.to_string()),
        ("aimePath", cfg.aime.aime_path.clone()),
        ("aimeGen", bool_to_string(cfg.aime.aime_gen)),
        ("felicaPath", cfg.aime.felica_path.clone()),
        ("felicaGen", bool_to_string(cfg.aime.felica_gen)),
        ("scan", cfg.aime.scan.to_string()),
        ("proxyFlag", cfg.aime.proxy_flag.to_string()),
        ("authdataPath", cfg.aime.authdata_path.clone()),
      ],
    );
  }

  if should_save("vfd") {
    save_helper("vfd",
      vec![
        ("enable", bool_to_string(cfg.vfd.enable)),
        ("portNo", cfg.vfd.port_no.to_string()),
        ("utfConversion", bool_to_string(cfg.vfd.utf_conversion)),
      ],
    );
  }

  if should_save("amvideo") {
    save_helper("amvideo", vec![("enable", bool_to_string(cfg.amvideo.enable))]);
  }

  if should_save("clock") {
    save_helper("clock",
      vec![
        ("timezone", bool_to_string(cfg.clock.timezone)),
        ("timewarp", bool_to_string(cfg.clock.timewarp)),
        ("writeable", bool_to_string(cfg.clock.writeable)),
      ],
    );
  }

  if should_save("dns") {
    save_helper("dns",
      vec![
        ("default", cfg.dns.default.clone()),
        ("title", cfg.dns.title.clone()),
        ("router", cfg.dns.router.clone()),
        ("startup", cfg.dns.startup.clone()),
        ("billing", cfg.dns.billing.clone()),
        ("aimedb", cfg.dns.aimedb.clone()),
        ("replaceHost", bool_to_string(cfg.dns.replace_host)),
        ("startupPort", cfg.dns.startup_port.to_string()),
        ("billingPort", cfg.dns.billing_port.to_string()),
        ("aimedbPort", cfg.dns.aimedb_port.to_string()),
      ],
    );
  }

  if should_save("ds") {
    save_helper("ds",
      vec![
        ("enable", bool_to_string(cfg.ds.enable)),
        ("region", cfg.ds.region.to_string()),
        ("serialNo", cfg.ds.serial_no.clone()),
      ],
    );
  }

  if should_save("eeprom") {
    save_helper("eeprom",
      vec![
        ("enable", bool_to_string(cfg.eeprom.enable)),
        ("path", cfg.eeprom.path.clone()),
      ],
    );
  }

  if should_save("gpio") {
    save_helper("gpio",
      vec![
        ("enable", bool_to_string(cfg.gpio.enable)),
        ("sw1", cfg.gpio.sw1.to_string()),
        ("sw2", cfg.gpio.sw2.to_string()),
        ("dipsw1", bool_to_string(cfg.gpio.dipsw1)),
        ("dipsw2", bool_to_string(cfg.gpio.dipsw2)),
        ("dipsw3", bool_to_string(cfg.gpio.dipsw3)),
        ("dipsw4", bool_to_string(cfg.gpio.dipsw4)),
        ("dipsw5", bool_to_string(cfg.gpio.dipsw5)),
        ("dipsw6", bool_to_string(cfg.gpio.dipsw6)),
        ("dipsw7", bool_to_string(cfg.gpio.dipsw7)),
        ("dipsw8", bool_to_string(cfg.gpio.dipsw8)),
      ],
    );
  }

  if should_save("gfx") {
    save_helper("gfx",
      vec![
        ("enable", bool_to_string(cfg.gfx.enable)),
        ("windowed", bool_to_string(cfg.gfx.windowed)),
        ("framed", bool_to_string(cfg.gfx.framed)),
        ("monitor", cfg.gfx.monitor.to_string()),
        ("dpiAware", bool_to_string(cfg.gfx.dpi_aware)),
      ],
    );
  }

  if should_save("hwmon") {
    save_helper("hwmon", vec![("enable", bool_to_string(cfg.hwmon.enable))]);
  }

  if should_save("jvs") {
    save_helper("jvs",
      vec![
        ("enable", bool_to_string(cfg.jvs.enable)),
        ("foreground", bool_to_string(cfg.jvs.foreground)),
      ],
    );
  }

  if should_save("io4") {
    save_helper("io4",
      vec![
        ("enable", bool_to_string(cfg.io4.enable)),
        ("foreground", bool_to_string(cfg.io4.foreground)),
        ("test", cfg.io4.test.to_string()),
        ("service", cfg.io4.service.to_string()),
        ("coin", cfg.io4.coin.to_string()),
      ],
    );
  }

  if should_save("keychip") {
    save_helper("keychip",
      vec![
        ("enable", bool_to_string(cfg.keychip.enable)),
        ("id", cfg.keychip.id.clone()),
        ("gameId", cfg.keychip.game_id.clone()),
        ("platformId", cfg.keychip.platform_id.clone()),
        ("region", cfg.keychip.region.to_string()),
        ("billingCa", cfg.keychip.billing_ca.clone()),
        ("billingPub", cfg.keychip.billing_pub.clone()),
        ("billingType", cfg.keychip.billing_type.to_string()),
        ("systemFlag", cfg.keychip.system_flag.to_string()),
        ("subnet", cfg.keychip.subnet.clone()),
      ],
    );
  }

  if should_save("netenv") {
    save_helper("netenv",
      vec![
        ("enable", bool_to_string(cfg.netenv.enable)),
        ("addrSuffix", cfg.netenv.addr_suffix.to_string()),
        ("routerSuffix", cfg.netenv.router_suffix.to_string()),
        ("macAddr", cfg.netenv.mac_addr.clone()),
      ],
    );
  }

  if should_save("pcbid") {
    save_helper("pcbid",
      vec![
        ("enable", bool_to_string(cfg.pcbid.enable)),
        ("serialNo", cfg.pcbid.serial_no.clone()),
      ],
    );
  }

  if should_save("sram") {
    save_helper("sram",
      vec![
        ("enable", bool_to_string(cfg.sram.enable)),
        ("path", cfg.sram.path.clone()),
      ],
    );
  }

  if should_save("vfs") {
    save_helper("vfs",
      vec![
        ("enable", bool_to_string(cfg.vfs.enable)),
        ("amfs", cfg.vfs.amfs.clone()),
        ("appdata", cfg.vfs.appdata.clone()),
        ("option", cfg.vfs.option.clone()),
      ],
    );
  }

  if should_save("epay") {
    save_helper("epay",
      vec![
        ("enable", bool_to_string(cfg.epay.enable)),
        ("hook", bool_to_string(cfg.epay.hook)),
      ],
    );
  }

  if should_save("openssl") {
    save_helper("openssl",
      vec![
        ("enable", bool_to_string(cfg.openssl.enable)),
        ("override", bool_to_string(cfg.openssl.override_flag)),
      ],
    );
  }

  if should_save("system") {
    save_helper("system",
      vec![
        ("enable", bool_to_string(cfg.system.enable)),
        ("freeplay", bool_to_string(cfg.system.freeplay)),
        ("dipsw1", bool_to_string(cfg.system.dipsw1)),
        ("dipsw2", bool_to_string(cfg.system.dipsw2)),
        ("dipsw3", bool_to_string(cfg.system.dipsw3)),
      ],
    );
  }

  if should_save("led15070") {
    save_helper("led15070",
      vec![("enable", bool_to_string(cfg.led15070.enable))],
    );
  }

  if should_save("unity") {
    save_helper("unity",
      vec![
        ("enable", bool_to_string(cfg.unity.enable)),
        ("targetAssembly", cfg.unity.target_assembly.clone()),
      ],
    );
  }

  if should_save("mai2io") {
    save_helper("mai2io",
      vec![("path", cfg.mai2io.path.clone())],
    );
  }

  if should_save("button") {
    save_helper("button",
      vec![
        ("enable", bool_to_string(cfg.button.enable)),
        ("p1Btn1", cfg.button.p1_btn1.to_string()),
        ("p1Btn2", cfg.button.p1_btn2.to_string()),
        ("p1Btn3", cfg.button.p1_btn3.to_string()),
        ("p1Btn4", cfg.button.p1_btn4.to_string()),
        ("p1Btn5", cfg.button.p1_btn5.to_string()),
        ("p1Btn6", cfg.button.p1_btn6.to_string()),
        ("p1Btn7", cfg.button.p1_btn7.to_string()),
        ("p1Btn8", cfg.button.p1_btn8.to_string()),
        ("p1Select", cfg.button.p1_select.to_string()),
        ("p2Btn1", cfg.button.p2_btn1.to_string()),
        ("p2Btn2", cfg.button.p2_btn2.to_string()),
        ("p2Btn3", cfg.button.p2_btn3.to_string()),
        ("p2Btn4", cfg.button.p2_btn4.to_string()),
        ("p2Btn5", cfg.button.p2_btn5.to_string()),
        ("p2Btn6", cfg.button.p2_btn6.to_string()),
        ("p2Btn7", cfg.button.p2_btn7.to_string()),
        ("p2Btn8", cfg.button.p2_btn8.to_string()),
        ("p2Select", cfg.button.p2_select.to_string()),
      ],
    );
  }

  if should_save("touch") {
    save_helper("touch",
      vec![
        ("p1Enable", bool_to_string(cfg.touch.p1_enable)),
        ("p2Enable", bool_to_string(cfg.touch.p2_enable)),
      ],
    );
  }

  if should_save("led15093") {
    save_helper("led15093",
      vec![("enable", bool_to_string(cfg.led15093.enable))],
    );
  }

  if should_save("led") {
    save_helper("led",
      vec![
        ("cabLedOutputPipe", bool_to_string(cfg.led.cab_led_output_pipe)),
        ("cabLedOutputSerial", bool_to_string(cfg.led.cab_led_output_serial)),
        ("controllerLedOutputPipe", bool_to_string(cfg.led.controller_led_output_pipe)),
        ("controllerLedOutputSerial", bool_to_string(cfg.led.controller_led_output_serial)),
        ("controllerLedOutputOpeNITHM", bool_to_string(cfg.led.controller_led_output_openithm)),
        ("serialPort", cfg.led.serial_port.clone()),
        ("serialBaud", cfg.led.serial_baud.to_string()),
      ],
    );
  }

  if should_save("chuniio") {
    save_helper("chuniio",
      vec![
        ("path", cfg.chuniio.path.clone()),
        ("path32", cfg.chuniio.path32.clone()),
        ("path64", cfg.chuniio.path64.clone()),
      ],
    );
  }

  if should_save("mu3io") {
    save_helper("mu3io",
      vec![("path", cfg.mu3io.path.clone())],
    );
  }

  if should_save("io3") {
    save_helper("io3",
      vec![
        ("test", cfg.io3.test.to_string()),
        ("service", cfg.io3.service.to_string()),
        ("coin", cfg.io3.coin.to_string()),
        ("ir", cfg.io3.ir.to_string()),
      ],
    );
  }

  if should_save("slider") {
    let mut vec = vec![("enable", bool_to_string(cfg.slider.enable))];
    vec.push(("cell1", cfg.slider.cell1.to_string()));
    vec.push(("cell2", cfg.slider.cell2.to_string()));
    vec.push(("cell3", cfg.slider.cell3.to_string()));
    vec.push(("cell4", cfg.slider.cell4.to_string()));
    vec.push(("cell5", cfg.slider.cell5.to_string()));
    vec.push(("cell6", cfg.slider.cell6.to_string()));
    vec.push(("cell7", cfg.slider.cell7.to_string()));
    vec.push(("cell8", cfg.slider.cell8.to_string()));
    vec.push(("cell9", cfg.slider.cell9.to_string()));
    vec.push(("cell10", cfg.slider.cell10.to_string()));
    vec.push(("cell11", cfg.slider.cell11.to_string()));
    vec.push(("cell12", cfg.slider.cell12.to_string()));
    vec.push(("cell13", cfg.slider.cell13.to_string()));
    vec.push(("cell14", cfg.slider.cell14.to_string()));
    vec.push(("cell15", cfg.slider.cell15.to_string()));
    vec.push(("cell16", cfg.slider.cell16.to_string()));
    vec.push(("cell17", cfg.slider.cell17.to_string()));
    vec.push(("cell18", cfg.slider.cell18.to_string()));
    vec.push(("cell19", cfg.slider.cell19.to_string()));
    vec.push(("cell20", cfg.slider.cell20.to_string()));
    vec.push(("cell21", cfg.slider.cell21.to_string()));
    vec.push(("cell22", cfg.slider.cell22.to_string()));
    vec.push(("cell23", cfg.slider.cell23.to_string()));
    vec.push(("cell24", cfg.slider.cell24.to_string()));
    vec.push(("cell25", cfg.slider.cell25.to_string()));
    vec.push(("cell26", cfg.slider.cell26.to_string()));
    vec.push(("cell27", cfg.slider.cell27.to_string()));
    vec.push(("cell28", cfg.slider.cell28.to_string()));
    vec.push(("cell29", cfg.slider.cell29.to_string()));
    vec.push(("cell30", cfg.slider.cell30.to_string()));
    vec.push(("cell31", cfg.slider.cell31.to_string()));
    vec.push(("cell32", cfg.slider.cell32.to_string()));
    save_helper("slider", vec);
  }

  if should_save("ir") {
    save_helper("ir",
      vec![
        ("ir1", cfg.ir.ir1.to_string()),
        ("ir2", cfg.ir.ir2.to_string()),
        ("ir3", cfg.ir.ir3.to_string()),
        ("ir4", cfg.ir.ir4.to_string()),
        ("ir5", cfg.ir.ir5.to_string()),
        ("ir6", cfg.ir.ir6.to_string()),
      ],
    );
  }

}

pub fn save_segatoools_config(path: &Path, cfg: &SegatoolsConfig) -> Result<(), ConfigError> {
  if let Some(dir) = path.parent() {
    fs::create_dir_all(dir)?;
  }

  if cfg.present_sections.is_empty() {
      let mut ini = Ini::new();
      perform_save(&mut ini, cfg);
      ini.write(path.to_string_lossy().as_ref()).map_err(ConfigError::Io)?;
  } else {
      let content = if path.exists() {
          fs::read_to_string(path).map_err(ConfigError::Io)?
      } else {
          String::new()
      };
      let content = prune_existing_content(&content, cfg);
      let mut updater = IniUpdater::new(&content);
      perform_save(&mut updater, cfg);
      fs::write(path, updater.to_string()).map_err(ConfigError::Io)?;
  }
  Ok(())
}

pub fn render_segatoools_config(cfg: &SegatoolsConfig, existing_content: Option<&str>) -> Result<String, ConfigError> {
  let base = existing_content.unwrap_or("");
  let mut updater = IniUpdater::new(base);
  perform_save(&mut updater, cfg);
  Ok(updater.to_string())
}

pub fn load_segatoools_config_from_string(content: &str) -> Result<SegatoolsConfig, ConfigError> {
  let mut parser = Ini::new();
  parser.read(content.to_string()).map_err(|e| ConfigError::Parse(e))?;

  let mut cfg = SegatoolsConfig::default();

  // Populate present_sections (include empty/comment-only sections)
  let mut present_sections: HashSet<String> = HashSet::new();
  let mut present_keys: Vec<String> = Vec::new();
  if let Some(map) = parser.get_map() {
    for k in map.keys() {
      present_sections.insert(k.to_lowercase());
      if let Some(sec) = map.get(k) {
        for key in sec.keys() {
          present_keys.push(format!("{}.{}", k.to_lowercase(), key.to_lowercase()));
        }
      }
    }
  }
  for line in content.lines() {
    let trimmed = line.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
      let name = trimmed[1..trimmed.len() - 1].trim().to_lowercase();
      if !name.is_empty() {
        present_sections.insert(name);
      }
    }
  }
  cfg.present_sections = present_sections.into_iter().collect();
  cfg.present_keys = present_keys;

  // Scan for commented keys
  let mut current_section = String::new();
  for line in content.lines() {
      let trimmed = line.trim();
      if trimmed.starts_with('[') && trimmed.ends_with(']') {
          current_section = trimmed[1..trimmed.len()-1].trim().to_string();
          continue;
      }
      
      if let Some((key, is_commented)) = parse_line_key(line) {
          if is_commented && !current_section.is_empty() {
              cfg.commented_keys.push(format!("{}.{}", current_section, key));
          }
      }
  }

  // Special handling for slider and ir sections: treat missing keys as commented
  if let Some(map) = parser.get_map() {
      let slider_map = map.get("slider");
      for i in 1..=32 {
          let key = format!("cell{}", i);
          let is_present = slider_map.map_or(false, |m| m.contains_key(&key));
          
          if !is_present {
              let full_key = format!("slider.{}", key);
              if !cfg.commented_keys.contains(&full_key) {
                  cfg.commented_keys.push(full_key);
              }
          }
      }

      let ir_map = map.get("ir");
      for i in 1..=6 {
          let key = format!("ir{}", i);
          let is_present = ir_map.map_or(false, |m| m.contains_key(&key));
          
          if !is_present {
              let full_key = format!("ir.{}", key);
              if !cfg.commented_keys.contains(&full_key) {
                  cfg.commented_keys.push(full_key);
              }
          }
      }
  }

  cfg.aimeio.path = read_string(&parser, "aimeio", "path", &cfg.aimeio.path);

  cfg.aime.enable = read_bool(&parser, "aime", "enable", cfg.aime.enable);
  cfg.aime.port_no = read_u32(&parser, "aime", "portNo", cfg.aime.port_no);
  cfg.aime.high_baud = read_bool(&parser, "aime", "highBaud", cfg.aime.high_baud);
  cfg.aime.gen = read_u32(&parser, "aime", "gen", cfg.aime.gen);
  cfg.aime.aime_path = read_string(&parser, "aime", "aimePath", &cfg.aime.aime_path);
  cfg.aime.aime_gen = read_bool(&parser, "aime", "aimeGen", cfg.aime.aime_gen);
  cfg.aime.felica_path = read_string(&parser, "aime", "felicaPath", &cfg.aime.felica_path);
  cfg.aime.felica_gen = read_bool(&parser, "aime", "felicaGen", cfg.aime.felica_gen);
  cfg.aime.scan = read_u32(&parser, "aime", "scan", cfg.aime.scan);
  cfg.aime.proxy_flag = read_u32(&parser, "aime", "proxyFlag", cfg.aime.proxy_flag);
  cfg.aime.authdata_path = read_string(&parser, "aime", "authdataPath", &cfg.aime.authdata_path);

  cfg.vfd.enable = read_bool(&parser, "vfd", "enable", cfg.vfd.enable);
  cfg.vfd.port_no = read_u32(&parser, "vfd", "portNo", cfg.vfd.port_no);
  cfg.vfd.utf_conversion = read_bool(&parser, "vfd", "utfConversion", cfg.vfd.utf_conversion);

  cfg.amvideo.enable = read_bool(&parser, "amvideo", "enable", cfg.amvideo.enable);

  cfg.clock.timezone = read_bool(&parser, "clock", "timezone", cfg.clock.timezone);
  cfg.clock.timewarp = read_bool(&parser, "clock", "timewarp", cfg.clock.timewarp);
  cfg.clock.writeable = read_bool(&parser, "clock", "writeable", cfg.clock.writeable);

  cfg.dns.default = read_string(&parser, "dns", "default", &cfg.dns.default);
  cfg.dns.title = read_string(&parser, "dns", "title", &cfg.dns.title);
  cfg.dns.router = read_string(&parser, "dns", "router", &cfg.dns.router);
  cfg.dns.startup = read_string(&parser, "dns", "startup", &cfg.dns.startup);
  cfg.dns.billing = read_string(&parser, "dns", "billing", &cfg.dns.billing);
  cfg.dns.aimedb = read_string(&parser, "dns", "aimedb", &cfg.dns.aimedb);
  cfg.dns.replace_host = read_bool(&parser, "dns", "replaceHost", cfg.dns.replace_host);
  cfg.dns.startup_port = read_u32(&parser, "dns", "startupPort", cfg.dns.startup_port);
  cfg.dns.billing_port = read_u32(&parser, "dns", "billingPort", cfg.dns.billing_port);
  cfg.dns.aimedb_port = read_u32(&parser, "dns", "aimedbPort", cfg.dns.aimedb_port);

  cfg.ds.enable = read_bool(&parser, "ds", "enable", cfg.ds.enable);
  cfg.ds.region = read_u32(&parser, "ds", "region", cfg.ds.region);
  cfg.ds.serial_no = read_string(&parser, "ds", "serialNo", &cfg.ds.serial_no);

  cfg.eeprom.enable = read_bool(&parser, "eeprom", "enable", cfg.eeprom.enable);
  cfg.eeprom.path = read_string(&parser, "eeprom", "path", &cfg.eeprom.path);

  cfg.gpio.enable = read_bool(&parser, "gpio", "enable", cfg.gpio.enable);
  cfg.gpio.sw1 = read_u32(&parser, "gpio", "sw1", cfg.gpio.sw1);
  cfg.gpio.sw2 = read_u32(&parser, "gpio", "sw2", cfg.gpio.sw2);
  cfg.gpio.dipsw1 = read_bool(&parser, "gpio", "dipsw1", cfg.gpio.dipsw1);
  cfg.gpio.dipsw2 = read_bool(&parser, "gpio", "dipsw2", cfg.gpio.dipsw2);
  cfg.gpio.dipsw3 = read_bool(&parser, "gpio", "dipsw3", cfg.gpio.dipsw3);
  cfg.gpio.dipsw4 = read_bool(&parser, "gpio", "dipsw4", cfg.gpio.dipsw4);
  cfg.gpio.dipsw5 = read_bool(&parser, "gpio", "dipsw5", cfg.gpio.dipsw5);
  cfg.gpio.dipsw6 = read_bool(&parser, "gpio", "dipsw6", cfg.gpio.dipsw6);
  cfg.gpio.dipsw7 = read_bool(&parser, "gpio", "dipsw7", cfg.gpio.dipsw7);
  cfg.gpio.dipsw8 = read_bool(&parser, "gpio", "dipsw8", cfg.gpio.dipsw8);

  cfg.gfx.enable = read_bool(&parser, "gfx", "enable", cfg.gfx.enable);
  cfg.gfx.windowed = read_bool(&parser, "gfx", "windowed", cfg.gfx.windowed);
  cfg.gfx.framed = read_bool(&parser, "gfx", "framed", cfg.gfx.framed);
  cfg.gfx.monitor = read_u32(&parser, "gfx", "monitor", cfg.gfx.monitor);
  cfg.gfx.dpi_aware = read_bool(&parser, "gfx", "dpiAware", cfg.gfx.dpi_aware);

  cfg.hwmon.enable = read_bool(&parser, "hwmon", "enable", cfg.hwmon.enable);

  cfg.jvs.enable = read_bool(&parser, "jvs", "enable", cfg.jvs.enable);
  cfg.jvs.foreground = read_bool(&parser, "jvs", "foreground", cfg.jvs.foreground);

  cfg.io4.enable = read_bool(&parser, "io4", "enable", cfg.io4.enable);
  cfg.io4.foreground = read_bool(&parser, "io4", "foreground", cfg.io4.foreground);
  cfg.io4.test = read_u32(&parser, "io4", "test", cfg.io4.test);
  cfg.io4.service = read_u32(&parser, "io4", "service", cfg.io4.service);
  cfg.io4.coin = read_u32(&parser, "io4", "coin", cfg.io4.coin);

  cfg.keychip.enable = read_bool(&parser, "keychip", "enable", cfg.keychip.enable);
  cfg.keychip.id = read_string(&parser, "keychip", "id", &cfg.keychip.id);
  cfg.keychip.game_id = read_string(&parser, "keychip", "gameId", &cfg.keychip.game_id);
  cfg.keychip.platform_id = read_string(&parser, "keychip", "platformId", &cfg.keychip.platform_id);
  cfg.keychip.region = read_u32(&parser, "keychip", "region", cfg.keychip.region);
  cfg.keychip.billing_ca = read_string(&parser, "keychip", "billingCa", &cfg.keychip.billing_ca);
  cfg.keychip.billing_pub = read_string(&parser, "keychip", "billingPub", &cfg.keychip.billing_pub);
  cfg.keychip.billing_type = read_u32(&parser, "keychip", "billingType", cfg.keychip.billing_type);
  cfg.keychip.system_flag = read_u32(&parser, "keychip", "systemFlag", cfg.keychip.system_flag);
  cfg.keychip.subnet = read_string(&parser, "keychip", "subnet", &cfg.keychip.subnet);

  cfg.netenv.enable = read_bool(&parser, "netenv", "enable", cfg.netenv.enable);
  cfg.netenv.addr_suffix = read_u32(&parser, "netenv", "addrSuffix", cfg.netenv.addr_suffix);
  cfg.netenv.router_suffix = read_u32(&parser, "netenv", "routerSuffix", cfg.netenv.router_suffix);
  cfg.netenv.mac_addr = read_string(&parser, "netenv", "macAddr", &cfg.netenv.mac_addr);

  cfg.pcbid.enable = read_bool(&parser, "pcbid", "enable", cfg.pcbid.enable);
  cfg.pcbid.serial_no = read_string(&parser, "pcbid", "serialNo", &cfg.pcbid.serial_no);

  cfg.sram.enable = read_bool(&parser, "sram", "enable", cfg.sram.enable);
  cfg.sram.path = read_string(&parser, "sram", "path", &cfg.sram.path);

  cfg.vfs.enable = read_bool(&parser, "vfs", "enable", cfg.vfs.enable);
  cfg.vfs.amfs = read_string(&parser, "vfs", "amfs", &cfg.vfs.amfs);
  cfg.vfs.appdata = read_string(&parser, "vfs", "appdata", &cfg.vfs.appdata);
  cfg.vfs.option = read_string(&parser, "vfs", "option", &cfg.vfs.option);

  cfg.epay.enable = read_bool(&parser, "epay", "enable", cfg.epay.enable);
  cfg.epay.hook = read_bool(&parser, "epay", "hook", cfg.epay.hook);

  cfg.openssl.enable = read_bool(&parser, "openssl", "enable", cfg.openssl.enable);
  cfg.openssl.override_flag = read_bool(&parser, "openssl", "override", cfg.openssl.override_flag);

  cfg.system.enable = read_bool(&parser, "system", "enable", cfg.system.enable);
  cfg.system.freeplay = read_bool(&parser, "system", "freeplay", cfg.system.freeplay);
  cfg.system.dipsw1 = read_bool(&parser, "system", "dipsw1", cfg.system.dipsw1);
  cfg.system.dipsw2 = read_bool(&parser, "system", "dipsw2", cfg.system.dipsw2);
  cfg.system.dipsw3 = read_bool(&parser, "system", "dipsw3", cfg.system.dipsw3);


  cfg.led15070.enable = read_bool(&parser, "led15070", "enable", cfg.led15070.enable);

  cfg.unity.enable = read_bool(&parser, "unity", "enable", cfg.unity.enable);
  cfg.unity.target_assembly = read_string(&parser, "unity", "targetAssembly", &cfg.unity.target_assembly);

  cfg.mai2io.path = read_string(&parser, "mai2io", "path", &cfg.mai2io.path);

  cfg.button.enable = read_bool(&parser, "button", "enable", cfg.button.enable);
  cfg.button.p1_btn1 = read_u32(&parser, "button", "p1Btn1", cfg.button.p1_btn1);
  cfg.button.p1_btn2 = read_u32(&parser, "button", "p1Btn2", cfg.button.p1_btn2);
  cfg.button.p1_btn3 = read_u32(&parser, "button", "p1Btn3", cfg.button.p1_btn3);
  cfg.button.p1_btn4 = read_u32(&parser, "button", "p1Btn4", cfg.button.p1_btn4);
  cfg.button.p1_btn5 = read_u32(&parser, "button", "p1Btn5", cfg.button.p1_btn5);
  cfg.button.p1_btn6 = read_u32(&parser, "button", "p1Btn6", cfg.button.p1_btn6);
  cfg.button.p1_btn7 = read_u32(&parser, "button", "p1Btn7", cfg.button.p1_btn7);
  cfg.button.p1_btn8 = read_u32(&parser, "button", "p1Btn8", cfg.button.p1_btn8);
  cfg.button.p1_select = read_u32(&parser, "button", "p1Select", cfg.button.p1_select);
  cfg.button.p2_btn1 = read_u32(&parser, "button", "p2Btn1", cfg.button.p2_btn1);
  cfg.button.p2_btn2 = read_u32(&parser, "button", "p2Btn2", cfg.button.p2_btn2);
  cfg.button.p2_btn3 = read_u32(&parser, "button", "p2Btn3", cfg.button.p2_btn3);
  cfg.button.p2_btn4 = read_u32(&parser, "button", "p2Btn4", cfg.button.p2_btn4);
  cfg.button.p2_btn5 = read_u32(&parser, "button", "p2Btn5", cfg.button.p2_btn5);
  cfg.button.p2_btn6 = read_u32(&parser, "button", "p2Btn6", cfg.button.p2_btn6);
  cfg.button.p2_btn7 = read_u32(&parser, "button", "p2Btn7", cfg.button.p2_btn7);
  cfg.button.p2_btn8 = read_u32(&parser, "button", "p2Btn8", cfg.button.p2_btn8);
  cfg.button.p2_select = read_u32(&parser, "button", "p2Select", cfg.button.p2_select);

  cfg.touch.p1_enable = read_bool(&parser, "touch", "p1Enable", cfg.touch.p1_enable);
  cfg.touch.p2_enable = read_bool(&parser, "touch", "p2Enable", cfg.touch.p2_enable);

  cfg.led15093.enable = read_bool(&parser, "led15093", "enable", cfg.led15093.enable);

  cfg.led.cab_led_output_pipe = read_bool(&parser, "led", "cabLedOutputPipe", cfg.led.cab_led_output_pipe);
  cfg.led.cab_led_output_serial = read_bool(&parser, "led", "cabLedOutputSerial", cfg.led.cab_led_output_serial);
  cfg.led.controller_led_output_pipe = read_bool(&parser, "led", "controllerLedOutputPipe", cfg.led.controller_led_output_pipe);
  cfg.led.controller_led_output_serial = read_bool(&parser, "led", "controllerLedOutputSerial", cfg.led.controller_led_output_serial);
  cfg.led.controller_led_output_openithm = read_bool(&parser, "led", "controllerLedOutputOpeNITHM", cfg.led.controller_led_output_openithm);
  cfg.led.serial_port = read_string(&parser, "led", "serialPort", &cfg.led.serial_port);
  cfg.led.serial_baud = read_u32(&parser, "led", "serialBaud", cfg.led.serial_baud);

  cfg.chuniio.path = read_string(&parser, "chuniio", "path", &cfg.chuniio.path);
  cfg.chuniio.path32 = read_string(&parser, "chuniio", "path32", &cfg.chuniio.path32);
  cfg.chuniio.path64 = read_string(&parser, "chuniio", "path64", &cfg.chuniio.path64);

  cfg.mu3io.path = read_string(&parser, "mu3io", "path", &cfg.mu3io.path);

  cfg.io3.test = read_u32(&parser, "io3", "test", cfg.io3.test);
  cfg.io3.service = read_u32(&parser, "io3", "service", cfg.io3.service);
  cfg.io3.coin = read_u32(&parser, "io3", "coin", cfg.io3.coin);
  cfg.io3.ir = read_u32(&parser, "io3", "ir", cfg.io3.ir);

  cfg.slider.enable = read_bool(&parser, "slider", "enable", cfg.slider.enable);
  cfg.slider.cell1 = read_u32(&parser, "slider", "cell1", cfg.slider.cell1);
  cfg.slider.cell2 = read_u32(&parser, "slider", "cell2", cfg.slider.cell2);
  cfg.slider.cell3 = read_u32(&parser, "slider", "cell3", cfg.slider.cell3);
  cfg.slider.cell4 = read_u32(&parser, "slider", "cell4", cfg.slider.cell4);
  cfg.slider.cell5 = read_u32(&parser, "slider", "cell5", cfg.slider.cell5);
  cfg.slider.cell6 = read_u32(&parser, "slider", "cell6", cfg.slider.cell6);
  cfg.slider.cell7 = read_u32(&parser, "slider", "cell7", cfg.slider.cell7);
  cfg.slider.cell8 = read_u32(&parser, "slider", "cell8", cfg.slider.cell8);
  cfg.slider.cell9 = read_u32(&parser, "slider", "cell9", cfg.slider.cell9);
  cfg.slider.cell10 = read_u32(&parser, "slider", "cell10", cfg.slider.cell10);
  cfg.slider.cell11 = read_u32(&parser, "slider", "cell11", cfg.slider.cell11);
  cfg.slider.cell12 = read_u32(&parser, "slider", "cell12", cfg.slider.cell12);
  cfg.slider.cell13 = read_u32(&parser, "slider", "cell13", cfg.slider.cell13);
  cfg.slider.cell14 = read_u32(&parser, "slider", "cell14", cfg.slider.cell14);
  cfg.slider.cell15 = read_u32(&parser, "slider", "cell15", cfg.slider.cell15);
  cfg.slider.cell16 = read_u32(&parser, "slider", "cell16", cfg.slider.cell16);
  cfg.slider.cell17 = read_u32(&parser, "slider", "cell17", cfg.slider.cell17);
  cfg.slider.cell18 = read_u32(&parser, "slider", "cell18", cfg.slider.cell18);
  cfg.slider.cell19 = read_u32(&parser, "slider", "cell19", cfg.slider.cell19);
  cfg.slider.cell20 = read_u32(&parser, "slider", "cell20", cfg.slider.cell20);
  cfg.slider.cell21 = read_u32(&parser, "slider", "cell21", cfg.slider.cell21);
  cfg.slider.cell22 = read_u32(&parser, "slider", "cell22", cfg.slider.cell22);
  cfg.slider.cell23 = read_u32(&parser, "slider", "cell23", cfg.slider.cell23);
  cfg.slider.cell24 = read_u32(&parser, "slider", "cell24", cfg.slider.cell24);
  cfg.slider.cell25 = read_u32(&parser, "slider", "cell25", cfg.slider.cell25);
  cfg.slider.cell26 = read_u32(&parser, "slider", "cell26", cfg.slider.cell26);
  cfg.slider.cell27 = read_u32(&parser, "slider", "cell27", cfg.slider.cell27);
  cfg.slider.cell28 = read_u32(&parser, "slider", "cell28", cfg.slider.cell28);
  cfg.slider.cell29 = read_u32(&parser, "slider", "cell29", cfg.slider.cell29);
  cfg.slider.cell30 = read_u32(&parser, "slider", "cell30", cfg.slider.cell30);
  cfg.slider.cell31 = read_u32(&parser, "slider", "cell31", cfg.slider.cell31);
  cfg.slider.cell32 = read_u32(&parser, "slider", "cell32", cfg.slider.cell32);

  cfg.ir.ir1 = read_u32(&parser, "ir", "ir1", cfg.ir.ir1);
  cfg.ir.ir2 = read_u32(&parser, "ir", "ir2", cfg.ir.ir2);
  cfg.ir.ir3 = read_u32(&parser, "ir", "ir3", cfg.ir.ir3);
  cfg.ir.ir4 = read_u32(&parser, "ir", "ir4", cfg.ir.ir4);
  cfg.ir.ir5 = read_u32(&parser, "ir", "ir5", cfg.ir.ir5);
  cfg.ir.ir6 = read_u32(&parser, "ir", "ir6", cfg.ir.ir6);

  Ok(cfg)
}

pub fn load_segatoools_config(path: &Path) -> Result<SegatoolsConfig, ConfigError> {
  let content = fs::read_to_string(path).map_err(ConfigError::Io)?;
  load_segatoools_config_from_string(&content)
}

pub fn default_segatoools_config() -> SegatoolsConfig {
  SegatoolsConfig::default()
}
