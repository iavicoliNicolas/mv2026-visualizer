# Visualizador paso a paso de la MV2026

App web de la máquina virtual MV1 2026, la de Fundamentos de la Arquitectura de Computadoras (UNMDP). Carga un binario `.vmx` (cabecera `VMX26`, versiones 1 y 2) o una imagen `.vmi` y muestra, fase por fase, qué hace el ciclo de instrucción: de dónde sale cada byte, qué registro cambia y qué celda de memoria se lee o se escribe.

El traductor `vmt` no está incluido. Se ejecutan los binarios que ese traductor ya generó.

## Qué se ve

El ciclo de cada instrucción se parte en siete fases, en el mismo orden que la MV de la cátedra, y el IP avanza antes de leer los operandos y de ejecutar:

1. **Fetch.** El IP lógico (`segmento:offset`) pasa a dirección física y se lee el byte de operación. Si el IP sale de CS, la máquina termina.
2. **Decode.** Los bits 0–4 son el opcode. El tamaño de los operandos sale de los bits altos.
3. **Operandos.** Registro (1 byte), inmediato (2) o memoria (3).
4. **Avanza IP.** `IP = IP + 1 + tamA + tamB`, antes de ejecutar. Así `CALL` apila la dirección de retorno.
5. **Lectura.** Registro, inmediato con signo, o memoria en big-endian (1, 2 o 4 bytes) a través de LAR, MAR y MBR.
6. **Ejecución.** Las 32 instrucciones. El CC muestra N, Z, C y V.
7. **Writeback.** Se escribe el destino cuando la operación lo pide (`MOV` y aritméticas salvo `CMP`, `SWAP` en ambos, `NOT` y `POP`).

La memoria sigue el orden físico PS, KS, CS, DS, ES, SS. La versión 1 usa el tamaño de código y deja el resto de la RAM para datos. La versión 2 declara código, datos, extra, pila y constantes, el entry point, y arma en la pila los argumentos, `argc` y el retorno `-1`.

`SYS` usa la consola de la página: `0` limpia, `1` y `3` esperan lo que se tipee, `2` y `4` imprimen con el formato de EAX (binario, hexadecimal, octal, carácter, decimal) y `0x0F` pausa el modo correr. `RND` usa la semilla que se ve arriba, así el mismo programa recorre siempre el mismo camino.

## Cómo correrlo

```bash
npm install
npm test
npm run dev
```

El servidor de desarrollo escucha en el puerto 4317. `npm test` corre el motor sin abrir el navegador: el loader de `hola.vmx`, un programa v2 armado a mano, el direccionamiento, el CC de ADD, SUB y CMP, la pila de CALL/RET y la salida de consola de `hola`.

## Cómo usarlo

Al abrir la página se carga `hola.vmx`, el programa de la cátedra. Cuatro `MOV` largos se pisan entre sí y dejan `H`, `o`, `l`, `a` en DS a partir del desplazamiento 3. Después, `SYS 2` imprime esos cuatro caracteres.

- **Micro-paso** avanza una fase. **Instrucción** completa el ciclo hasta volver a fetch. **Correr** anima las fases a la velocidad elegida y **Pausa** lo frena. **Reiniciar** vuelve a cargar el programa actual.
- Teclas, cuando el foco no está en un campo: `N` micro-paso, `I` instrucción, `R` correr o pausar.
- **Banderas** muestra ADD, el acarreo y un CALL/RET. **Salto** muestra un `JZ` que se saltea una instrucción.
- **Abrir .vmx / .vmi** carga un binario propio. La RAM puede ser de 8, 16 o 32 KiB. Los parámetros `-p` se separan por espacios y se releen al salir del campo. La semilla de `RND` también.
- Una lectura de `SYS` habilita el campo de la consola. El error (instrucción inválida, división por cero, fallo de segmento, stack overflow o underflow) deja la máquina detenida en esa fase, sin cerrar la página.

En una pantalla angosta los paneles quedan en columna: ciclo, registros, código, memoria y consola.
