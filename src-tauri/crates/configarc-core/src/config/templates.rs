pub const CHUSAN_TEMPLATE: &str = r#"; -----------------------------------------------------------------------------
; Path settings
; -----------------------------------------------------------------------------

[vfs]
; Insert the path to the game AMFS directory here (contains ICF1 and ICF2)
amfs=
; Insert the path to the game Option directory here (contains Axxx directories)
option=
; Create an empty directory somewhere and insert the path here.
; This directory may be shared between multiple SEGA games.
; NOTE: This has nothing to do with Windows %APPDATA%.
appdata=

; -----------------------------------------------------------------------------
; Device settings
; -----------------------------------------------------------------------------

[aime]
; Enable Aime card reader assembly emulation. Disable to use a real SEGA Aime
; reader.
enable=1
aimePath=DEVICE\aime.txt
; Enable high baud rate.
;highBaud=1

; Virtual-key code. If this button is **held** then the emulated IC card reader
; emulates an IC card in its proximity. A variety of different IC cards can be
; emulated; the exact choice of card that is emulated depends on the presence or
; absence of the configured card ID files. Default is the Return key.
scan=0x0D

[vfd]
; Enable VFD emulation. Disable to use a real VFD
; GP1232A02A FUTABA assembly.
enable=1

; -----------------------------------------------------------------------------
; Network settings
; -----------------------------------------------------------------------------

[dns]
; Insert the hostname or IP address of the server you wish to use here.
; Note that 127.0.0.1, localhost etc are specifically rejected.
default=127.0.0.1

[netenv]
; Simulate an ideal LAN environment. This may interfere with head-to-head play.
; Chunithm is extremely picky about its LAN environment, so leaving this
; setting enabled is strongly recommended.
enable=1

; The final octet of the local host's IP address on the virtualized subnet (so,
; if the keychip subnet is `192.168.32.0` and this value is set to `11`, then the
; local host's virtualized LAN IP is `192.168.32.11`).
addrSuffix=11

; -----------------------------------------------------------------------------
; Board settings
; -----------------------------------------------------------------------------

[keychip]
; Keychip serial number. Keychip serials observed in the wild follow this
; pattern: `A\d{2}(E|X)-(01|20)[ABCDU]\d{8}`.
id=A69E-01A88888888

; The /24 LAN subnet that the emulated keychip will tell the game to expect.
; If you disable netenv then you must set this to your LAN's IP subnet, and
; that subnet must start with 192.168.
subnet=192.168.139.0

[pcbid]
; Set the Windows host name. This should be an ALLS MAIN ID, without the
; hyphen (which is not a valid character in a Windows host name).
serialNo=ACAE01A99999999

[system]
; Enable ALLS system settings.
enable=1

; Enable freeplay mode. This will disable the coin slot and set the game to
; freeplay. Keep in mind that some game modes (e.g. Freedom/Time Modes) will not
; allow you to start a game in freeplay mode.
freeplay=0

; LAN Install: If multiple machines are present on the same LAN then set 
; this to 1 on exactly one machine and set this to 0 on all others.
dipsw1=1
; Monitor type: 0 = 120FPS, 1 = 60FPS
dipsw2=1
; Cab type: 0 = SP, 1 = CVT. SP will enable VFD and eMoney. This setting will switch
; the LED 837-15093-06 COM port and the AiMe reder hardware generation as well.
dipsw3=1

; -----------------------------------------------------------------------------
; Misc. hooks settings
; -----------------------------------------------------------------------------

[gfx]
; Enables the graphics hook.
enable=1
; Force the game to run windowed.
windowed=1
; Add a frame to the game window if running windowed.
framed=0
; Select the monitor to run the game on. (Fullscreen only, 0 =primary screen)
monitor=0
; Enable DPI awareness for the game process, preventing Windows from stretching the game window if a DPI scaling higher than 100% is used
dpiAware=1

; -----------------------------------------------------------------------------
; LED settings
; -----------------------------------------------------------------------------

[led15093]
; Enable emulation of the 15093-06 controlled lights, which handle the air tower 
; RGBs and the rear LED panel (billboard) on the cabinet.
enable=1

[led]
; Output billboard LED strip data to a named pipe called "\\.\pipe\chuni_led"
cabLedOutputPipe=1
; Output billboard LED strip data to serial
cabLedOutputSerial=0

; Output slider LED data to the named pipe
controllerLedOutputPipe=1
; Output slider LED data to the serial port
controllerLedOutputSerial=0
; Use the OpeNITHM protocol for serial LED output
controllerLedOutputOpeNITHM=0

; Serial port to send data to if using serial output. Default is COM5.
;serialPort=COM5
; Baud rate for serial data (set to 115200 if using OpeNITHM)
;serialBaud=921600

; Data output a sequence of bytes, with JVS-like framing.
; Each "packet" starts with 0xE0 as a sync. To avoid E0 appearing elsewhere,
; 0xD0 is used as an escape character -- if you receive D0 in the output, ignore
; it and use the next sent byte plus one instead.
;
; After the sync is one byte for the board number that was updated, followed by
; the red, green and blue values for each LED.
;
; Board 0 has 53 LEDs:
;   [0]-[49]: snakes through left half of billboard (first column starts at top)
;   [50]-[52]: left side partition LEDs
;
; Board 1 has 63 LEDs:
;   [0]-[59]: right half of billboard (first column starts at bottom)
;   [60]-[62]: right side partition LEDs
;
; Board 2 is the slider and has 31 LEDs:
;   [0]-[31]: slider LEDs right to left BRG, alternating between keys and dividers


; -----------------------------------------------------------------------------
; Custom IO settings
; -----------------------------------------------------------------------------

[aimeio]
; To use a custom card reader IO DLL (x64) enter its path here.
; Leave empty if you want to use Segatools built-in keyboard input.
path=

[chuniio]
; Uncomment this if you have custom chuniio implementation comprised of a single 32bit DLL.
; (will use chu2to3 engine internally)
;path=

; Uncomment both of these if you have custom chuniio implementation comprised of two DLLs.
; x86 chuniio to path32, x64 to path64. Both are necessary.
;path32=
;path64=

; -----------------------------------------------------------------------------
; Input settings
; -----------------------------------------------------------------------------

; Keyboard bindings are specified as hexadecimal (prefixed with 0x) or decimal
; (not prefixed with 0x) virtual-key codes, a list of which can be found here:
;
; https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
;
; This is, admittedly, not the most user-friendly configuration method in the
; world. An improved solution will be provided later.

[io3]
; Test button virtual-key code. Default is the F1 key.
test=0x70
; Service button virtual-key code. Default is the F2 key.
service=0x71
; Keyboard button to increment coin counter. Default is the F3 key.
coin=0x72
; Set to 0 for enable separate ir control. Deafult is space key.
ir=0x20

[ir]
; Uncomment and complete the following sequence of settings to configure a
; custom ir-cappable controller if you have one.
;ir6=0x53
; ... etc ...
;ir1=0x53

[slider]
; Enable slider emulation. If you have real AC slider, set this to 0.
; Slider serial port must be COM1.
;enable=1

; Key bindings for each of the 32 touch cells. The default key map, depicted
; in left-to-right order, is as follows:
;
;                   SSSSDDDDFFFFGGGGHHHHJJJJKKKKLLLL
;
; Touch cells are numbered FROM RIGHT TO LEFT! starting from 1. This is in
; order to match the numbering used in the operator menu and service manual.
;
; Uncomment and complete the following sequence of settings to configure a
; custom high-precision touch strip controller if you have one.
;cell1=0x53
;cell2=0x53
; ... etc ...
;cell31=0x53
;cell32=0x53
"#;

pub const MAI2_TEMPLATE: &str = r#"; -----------------------------------------------------------------------------
; Path settings
; -----------------------------------------------------------------------------

[vfs]
; Insert the path to the game AMFS directory here (contains ICF1 and ICF2)
amfs=
; Insert the path to the game Option directory here (contains Axxx directories)
option=
; Create an empty directory somewhere and insert the path here.
; This directory may be shared between multiple SEGA games.
; NOTE: This has nothing to do with Windows %APPDATA%.
appdata=

; -----------------------------------------------------------------------------
; Device settings
; -----------------------------------------------------------------------------

[aime]
; Enable Aime card reader assembly emulation. Disable to use a real SEGA Aime
; reader.
enable=1
aimePath=DEVICE\aime.txt

; Virtual-key code. If this button is **held** then the emulated IC card reader
; emulates an IC card in its proximity. A variety of different IC cards can be
; emulated; the exact choice of card that is emulated depends on the presence or
; absence of the configured card ID files. Default is the Return key.
scan=0x0D

[vfd]
; Enable VFD emulation. Disable to use a real VFD
; GP1232A02A FUTABA assembly.
enable=1

; -----------------------------------------------------------------------------
; Network settings
; -----------------------------------------------------------------------------

[dns]
; Insert the hostname or IP address of the server you wish to use here.
; Note that 127.0.0.1, localhost etc are specifically rejected.
default=127.0.0.1

[netenv]
; Simulate an ideal LAN environment. This may interfere with head-to-head play.
; SEGA games are somewhat picky about its LAN environment, so leaving this
; setting enabled is recommended.
enable=1
; The final octet of the local host's IP address on the virtualized subnet (so,
; if the keychip subnet is `192.168.32.0` and this value is set to `11`, then the
; local host's virtualized LAN IP is `192.168.32.11`).
addrSuffix=11

; -----------------------------------------------------------------------------
; Board settings
; -----------------------------------------------------------------------------

[keychip]
; Keychip serial number. Keychip serials observed in the wild follow this
; pattern: `A\d{2}(E|X)-(01|20)[ABCDU]\d{8}`.
id=A69E-01A88888888

; The /24 LAN subnet that the emulated keychip will tell the game to expect.
; If you disable netenv then you must set this to your LAN's IP subnet, and
; that subnet must start with 192.168.
subnet=192.168.172.0

[pcbid]
; Set the Windows host name. This should be an ALLS MAIN ID, without the
; hyphen (which is not a valid character in a Windows host name).
serialNo=ACAE01A99999999

[system]
; Enable ALLS system settings.
enable=1

; Enable freeplay mode. This will disable the coin slot and set the game to
; freeplay. Keep in mind that some game modes (e.g. Freedom/Time Modes) will not
; allow you to start a game in freeplay mode.
freeplay=0

; LAN Install: If multiple machines are present on the same LAN then set 
; this to 1 on exactly one machine and set this to 0 on all others.
dipsw1=1

; -----------------------------------------------------------------------------
; LED settings
; -----------------------------------------------------------------------------

[led15070]
; Enable emulation of the 837-15070-04 controlled lights, which handle the
; cabinet and button LEDs.
enable=1

; -----------------------------------------------------------------------------
; Misc. hook settings
; -----------------------------------------------------------------------------

[unity]
; Enable Unity hook. This will allow you to run custom .NET code before the game
enable=1

; Path to a .NET DLL that should run before the game. Useful for loading
; modding frameworks such as BepInEx.
targetAssembly=

; -----------------------------------------------------------------------------
; Custom IO settings
; -----------------------------------------------------------------------------

[aimeio]
; To use a custom card reader IO DLL enter its path here.
; Leave empty if you want to use Segatools built-in keyboard input.
path=

[mai2io]
; To use a custom maimai DX IO DLL enter its path here.
; Leave empty if you want to use Segatools built-in keyboard input.
path=

; -----------------------------------------------------------------------------
; Input settings
; -----------------------------------------------------------------------------

; Keyboard bindings are specified as hexadecimal (prefixed with 0x) or decimal
; (not prefixed with 0x) virtual-key codes, a list of which can be found here:
;
; https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
;
; This is, admittedly, not the most user-friendly configuration method in the
; world. An improved solution will be provided later.

[io4]
; Test button virtual-key code. Default is the F1 key.
test=0x70
; Service button virtual-key code. Default is the F2 key.
service=0x71
; Keyboard button to increment coin counter. Default is the F3 key.
coin=0x72

; Key bindings for buttons around screen. The default key map, depicted
; in clockwise order, is as follows:
;
; Player 1 Ring buttons: WEDCXZAQ, Select button: 3
; Player 2 Ring buttons: (Numpad) 89632147, Select button: (Numpad) *
;
; Select buttons are considered as button 9.
;
; Uncomment and complete the following sequence of settings to configure a
; custom keybinding.
[button]
enable=1
;p1Btn1=0x53
;p1Btn2=0x53
;p1Btn3=0x53
; ... etc ...
;p2Btn1=0x53
;p2Btn2=0x53
;p2Btn3=0x53
; ... etc ...

[touch]
p1Enable=1
;p1DebugInput=0
p2Enable=1
;p2DebugInput=0
;p1TouchA1=0x53
;p1TouchA2=0x53
; ... etc ...
;p1TouchE8=0x53
"#;

pub const MU3_TEMPLATE: &str = r#"; -----------------------------------------------------------------------------
; Path settings
; -----------------------------------------------------------------------------

[vfs]
; Insert the path to the game AMFS directory here (contains ICF1 and ICF2)
amfs=
; Insert the path to the game Option directory here (contains Axxx directories)
option=
; Create an empty directory somewhere and insert the path here.
; This directory may be shared between multiple SEGA games.
; NOTE: This has nothing to do with Windows %APPDATA%.
appdata=

; -----------------------------------------------------------------------------
; Device settings
; -----------------------------------------------------------------------------

[aime]
; Enable Aime card reader assembly emulation. Disable to use a real SEGA Aime
; reader.
enable=1
aimePath=DEVICE\aime.txt

; Virtual-key code. If this button is **held** then the emulated IC card reader
; emulates an IC card in its proximity. A variety of different IC cards can be
; emulated; the exact choice of card that is emulated depends on the presence or
; absence of the configured card ID files. Default is the Return key.
scan=0x0D

[vfd]
; Enable VFD emulation. Disable to use a real VFD
; GP1232A02A FUTABA assembly.
enable=1

; -----------------------------------------------------------------------------
; Network settings
; -----------------------------------------------------------------------------

[dns]
; Insert the hostname or IP address of the server you wish to use here.
; Note that 127.0.0.1, localhost etc are specifically rejected.
default=127.0.0.1

[netenv]
; Simulate an ideal LAN environment. This may interfere with head-to-head play.
; SEGA games are somewhat picky about their LAN environment, so leaving this
; setting enabled is recommended.
enable=1

; -----------------------------------------------------------------------------
; Board settings
; -----------------------------------------------------------------------------

[keychip]
; Keychip serial number. Keychip serials observed in the wild follow this
; pattern: `A\d{2}(E|X)-(01|20)[ABCDU]\d{8}`.
id=A69E-01A88888888

; The /24 LAN subnet that the emulated keychip will tell the game to expect.
; If you disable netenv then you must set this to your LAN's IP subnet, and
; that subnet must start with 192.168.
subnet=192.168.162.0

[pcbid]
; Set the Windows host name. This should be an ALLS MAIN ID, without the
; hyphen (which is not a valid character in a Windows host name).
serialNo=ACAE01A99999999

[system]
; Enable ALLS system settings.
enable=1

; Enable freeplay mode. This will disable the coin slot and set the game to
; freeplay. Keep in mind that some game modes (e.g. Freedom/Time Modes) will not
; allow you to start a game in freeplay mode.
freeplay=0

; LAN Install: If multiple machines are present on the same LAN then set 
; this to 1 on exactly one machine and set this to 0 on all others.
dipsw1=1

; -----------------------------------------------------------------------------
; Misc. hook settings
; -----------------------------------------------------------------------------

[gfx]
; Enables the graphics hook.
enable=1
; Enable DPI awareness for the game process, preventing Windows from stretching the game window if a DPI scaling higher than 100% is used
dpiAware=1


[unity]
; Enable Unity hook. This will allow you to run custom .NET code before the game
enable=1

; Path to a .NET DLL that should run before the game. Useful for loading
; modding frameworks such as BepInEx.
targetAssembly=

; -----------------------------------------------------------------------------
; LED settings
; -----------------------------------------------------------------------------

[led15093]
; Enable emulation of the 15093-06 controlled lights, which handle the air tower 
; RGBs and the rear LED panel (billboard) on the cabinet.
enable=1

[led]
; Output billboard LED strip data to a named pipe called "\\.\pipe\ongeki_led"
cabLedOutputPipe=1
; Output billboard LED strip data to serial
cabLedOutputSerial=0

; Output slider LED data to the named pipe
controllerLedOutputPipe=1
; Output slider LED data to the serial port
controllerLedOutputSerial=0

; Serial port to send data to if using serial output. Default is COM5.
;serialPort=COM5
; Baud rate for serial data
;serialBaud=921600

; Data output a sequence of bytes, with JVS-like framing.
; Each "packet" starts with 0xE0 as a sync. To avoid E0 appearing elsewhere,
; 0xD0 is used as an escape character -- if you receive D0 in the output, ignore
; it and use the next sent byte plus one instead.
;
; After the sync is one byte for the board number that was updated, followed by
; the red, green and blue values for each LED.
;
; Board 0 has 61 LEDs:
;   [0]-[1]: left side button
;   [2]-[8]: left pillar lower LEDs
;   [9]-[17]: left pillar center LEDs
;   [18]-[24]: left pillar upper LEDs
;   [25]-[35]: billboard LEDs
;   [36]-[42]: right pillar upper LEDs
;   [43]-[51]: right pillar center LEDs
;   [52]-[58]: right pillar lower LEDs
;   [59]-[60]: right side button
;
; Board 1 has 6 LEDs:
;   [0]-[5]: 3 left and 3 right controller buttons
;

; -----------------------------------------------------------------------------
; Custom IO settings
; -----------------------------------------------------------------------------

[aimeio]
; To use a custom card reader IO DLL enter its path here.
; Leave empty if you want to use Segatools built-in keyboard input.
path=

[mu3io]
; To use a custom O.N.G.E.K.I. IO DLL enter its path here.
; Leave empty if you want to use Segatools built-in keyboard/gamepad input.
path=

; -----------------------------------------------------------------------------
; Input settings
; -----------------------------------------------------------------------------

; Keyboard bindings are specified as hexadecimal (prefixed with 0x) or decimal
; (not prefixed with 0x) virtual-key codes, a list of which can be found here:
;
; https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
;
; This is, admittedly, not the most user-friendly configuration method in the
; world. An improved solution will be provided later.

[io4]
; Test button virtual-key code. Default is the F1 key.
test=0x70
; Service button virtual-key code. Default is the F2 key.
service=0x71
; Keyboard button to increment coin counter. Default is the F3 key.
coin=0x72

; Set "1" to enable mouse lever emulation, "0" to use XInput
mouse=1

; XInput input bindings
;
; Left Stick        Lever
; Left Trigger      Lever (move to the left)
; Right Trigger     Lever (move to the right)
; Left              Left red button
; Up                Left green button
; Right             Left blue button
; Left Shoulder     Left side button
; Right Shoulder    Right side button
; X                 Right red button
; Y                 Right green button
; A                 Right blue button
; Back              Left menu button
; Start             Right menu button

; Keyboard input bindings
left1=0x41  ; A
left2=0x53  ; S
left3=0x44  ; D

leftSide=0x01   ; Mouse Left
rightSide=0x02  ; Mouse Right

right1=0x4A ; J
right2=0x4B ; K
right3=0x4C ; L

leftMenu=0x55   ; U
rightMenu=0x4F  ; O
"#;
