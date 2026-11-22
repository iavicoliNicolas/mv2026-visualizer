# Visualizador de escritorio MV2026

Aplicación de escritorio de la máquina virtual MV1 2026, la de Fundamentos de la Arquitectura de Computadoras (UNMDP). Carga un binario `.vmx` (cabecera `VMX26`, versiones 1 y 2) o una imagen `.vmi` y muestra, fase por fase, qué hace el ciclo de instrucción: de dónde sale cada byte, qué registro cambia y qué celda de memoria se lee o se escribe.

El motor y la interfaz están en TypeScript. [Tauri](https://v2.tauri.app/) 2 los empaqueta en una ventana nativa: en Windows con WebView2 y en Linux con webkit2gtk. El traductor `vmt` y el código C de la cátedra no están incluidos. Se ejecutan los binarios que ese traductor ya generó.

Al abrir la aplicación se carga `hola.vmx`, el programa de ejemplo de la cátedra. Cuatro `MOV` largos se pisan entre sí y dejan `H`, `o`, `l`, `a` en DS a partir del desplazamiento 3. Después, `SYS 2` imprime esos cuatro caracteres en la consola, cada uno en su línea con el formato de la cátedra (`[dirección]: binario letra`).

## Estructura del proyecto

```
.
├── src/                  motor y la interfaz React
│   ├── vm/               loader, ciclo, instrucciones, consola
│   ├── components/       código, ciclo, registros, memoria y consola
│   ├── styles/           Tailwind
│   └── main.tsx          entrada de Vite
├── public/samples/       hola.vmx, el ejemplo que se carga al abrir
├── tests/                pruebas del motor, sin ventana
├── src-tauri/            shell de Tauri: Cargo, ventana, iconos, permisos
├── index.html            página estática que Tauri muestra
└── .github/workflows/    release.yml, compilación y borrador de release
```

`src-tauri/capabilities/default.json` permite el diálogo nativo de abrir archivo y leer el `.vmx` o `.vmi` elegido. La lectura cubre el perfil del usuario (inicio, documentos, descargas, escritorio), temporales y medios montados en Linux. El archivo que se elige en el diálogo también entra al permiso de lectura de esa sesión.

## Requisitos

- Node.js 22 y npm
- Rust stable, 1.90 o más nuevo, con rustup y cargo. El archivo `rust-toolchain.toml` pide el canal stable.
- Windows: [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/). Windows 11 ya lo trae. El instalador NSIS/MSI usa el bootstrap de WebView2 si falta.
- Linux (Debian/Ubuntu), para compilar y para ejecutar:

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

En Ubuntu 22.04 el paquete de AppIndicator del workflow de GitHub es `libappindicator3-dev`. `libwebkit2gtk-4.1-dev` es el que pide Tauri 2.

## Desarrollo

```bash
npm install
npm test
npm run tauri dev
```

`npm test` corre el motor sin abrir la ventana: el loader de `hola.vmx`, un programa v2 armado a mano, el direccionamiento, el CC de ADD, SUB y CMP, la pila de CALL/RET y la salida de consola de `hola`. `npm run tauri dev` levanta Vite en el puerto 1420 y abre la ventana.

## Compilar los instaladores

En Linux, `.deb` y AppImage:

```bash
npm run tauri build -- --bundles deb,appimage
```

`npm run tauri build` solo hace lo mismo en Linux, porque la configuración pide `deb`, `appimage`, `msi` y `nsis`, y Tauri arma únicamente los formatos del sistema actual.

Los archivos quedan en:

- `src-tauri/target/release/bundle/deb/`
- `src-tauri/target/release/bundle/appimage/`

En Windows, instalador NSIS (`.exe`) y MSI, desde PowerShell o cmd en la raíz del repo:

```bash
npm run tauri build -- --bundles nsis,msi
```

Quedan en:

- `src-tauri/target/release/bundle/nsis/`
- `src-tauri/target/release/bundle/msi/`

Hace falta el mismo toolchain de Rust y, para el enlace, las Visual Studio Build Tools con el workload de C++. WebView2 tiene que estar instalado para ejecutar el resultado.

## Publicar una versión

Las versiones salen de un tag `v*`. El archivo `.github/workflows/release.yml` compila en `windows-latest` (NSIS y MSI) y en `ubuntu-22.04` (AppImage y `.deb`, con las dependencias de webkit2gtk 4.1) y sube los bundles a un **borrador** de GitHub Release. El mismo workflow compila esos bundles en cada pull request, sin publicar nada.

1. Dejá alineados `version` en `package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`. Hoy están en `0.1.0`.
2. Commiteá en `main`.
3. Etiquetá y empujá el tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. Cuando termine Actions, abrí el borrador del release, revisá los cuatro instaladores y publicalo.

También se puede disparar a mano con `workflow_dispatch` desde la pestaña Actions. En ese caso el tag del borrador sale de la versión de `tauri.conf.json` (`v0.1.0`).

No hay firma de código configurada. Windows SmartScreen va a advertir al abrir el `.exe` y el `.msi`. El `.deb` no está firmado con GPG y el AppImage tampoco. Para distribuirlo sin esa advertencia hay que agregar un certificado (signtool o Azure Trusted Signing) y los secretos correspondientes en el repositorio. Este repo no define esos secretos ni una clave del updater de Tauri.

## Cómo se usa

El ciclo de cada instrucción se parte en siete fases, en el mismo orden que la MV de la cátedra, y el IP avanza antes de leer los operandos y de ejecutar: fetch, decode, operandos, avanza IP, lectura, ejecución y writeback.

- **Micro-paso** avanza una fase. **Instrucción** completa el ciclo hasta volver a fetch. **Correr** anima las fases a la velocidad elegida y **Pausa** lo frena. **Reiniciar** vuelve a cargar el programa actual.
- Teclas, cuando el foco no está en un campo: `N` micro-paso, `I` instrucción, `R` correr o pausar.
- **Hola**, **Banderas** y **Salto** cargan programas de muestra. **Abrir .vmx / .vmi** usa el diálogo nativo del sistema y lee el archivo con el plugin de sistema de archivos.
- La RAM puede ser de 8, 16 o 32 KiB. Los parámetros `-p` se separan por espacios y se releen al salir del campo. La semilla de `RND` también.
- Una lectura de `SYS` habilita el campo de la consola. Un error (instrucción inválida, división por cero, fallo de segmento, stack overflow o underflow) deja la máquina detenida en esa fase.

## English

Desktop step-through visualizer for the UNMDP MV1 2026 virtual machine. The TypeScript engine and React UI run inside a Tauri 2 window. Opening the app loads the course sample `hola.vmx`, which prints `H`, `o`, `l`, `a` through `SYS 2`. **Abrir .vmx / .vmi** opens a native file dialog and reads the chosen program.

Prerequisites: Node.js 22, Rust stable (1.90+), WebView2 on Windows, and `libwebkit2gtk-4.1-dev` plus the usual GTK build packages on Linux (see the Spanish section).

```bash
npm install
npm test
npm run tauri dev
npm run tauri build -- --bundles deb,appimage    # Linux
npm run tauri build -- --bundles nsis,msi        # Windows
```

Pushing a `v0.1.0` tag (versions in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` must match) runs `.github/workflows/release.yml` and creates a draft GitHub Release with the Windows NSIS `.exe`, the MSI, the Linux AppImage, and the `.deb`. Pull requests run the same builds and do not publish. Code signing is not configured.
