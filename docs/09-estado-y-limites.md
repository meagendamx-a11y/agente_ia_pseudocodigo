# 09 — El estado verificado y lo que queda abierto

Corte: **2026-08-27**. Las secciones 1, 2 y 3 se volvieron a leer de la base viva ese día, en el
proyecto `ssyzfeadyrczlzjbvxyl` (Postgres 17.6.1.155, `ACTIVE_HEALTHY`), sólo con `SELECT`, más la
lectura del cuerpo desplegado de la función de borde del portal. No se ejecutó ninguna escritura,
ninguna migración y ningún DDL. Lo que no se pudo leer hoy está en la sección 5, dicho con todas sus
letras y sin estimar.

Aquí viven los números duros del sistema. Si uno cambia, se vuelve a leer de la base antes de
tocarlo: no se ajusta de memoria ni se hereda de un corte anterior.

---

## 1. Los datos del negocio

### 1.1 El resumen

| Dato | Valor al 2026-08-27 |
|---|---|
| Profesionales | 6, las 6 con política configurada |
| Profesionales con el agendado por parte de la paciente apagado | 1, y es una cuenta de prueba |
| Cobro por adelantado | 1 de 6: Araceli |
| Datos de pago llenos (banco, titular, CLABE) | 2 de 6: Araceli y una cuenta de prueba |
| Aviso de cambio | 1440 minutos en cinco, **720 en Miranda** |
| Anticipación mínima de la paciente | 2880 minutos en tres, 1440 en tres |
| Cambio de modalidad | las dos direcciones en una; sólo a en línea en una; ninguna dirección en cuatro |
| Pacientes | 19 en total: 17 en alta, 2 en baja |
| Pacientes en alta sin ningún servicio asignado | **12 de 17** |
| Filas de paciente + servicio | 6 |
| Citas futuras en `scheduled` | **30**; 32 futuras contando cualquier estado |
| Series de recurrencia | **1**, semanal, de Araceli, arranca el 2026-08-30 |
| Pagos | 73; 34 con cobro por adelantado, y 30 de esos 34 cuelgan de citas vivas |
| Cobros esperando comprobante | **3**: dos de sesiones pasadas y uno de una futura |
| Comprobantes en toda la historia | **0** |
| Reseñas | 0 |
| Vínculos de WhatsApp | 19; **cero teléfonos con dos profesionales** |
| Plantillas en el catálogo de la base | **16** |

Tres de estos números mandan sobre el diseño más de lo que parece.

**12 de 17 sin servicio asignado** es la razón de que `ver_servicios` traiga el catálogo completo de
la profesional cuando la paciente no tiene ninguno. No es un caso de borde: es el camino normal.

**Una serie de recurrencia viva** basta para que la lista de citas próximas se colapse por serie, y
es la razón de que `pasar_pago` no señale destino. La segunda ocurrencia de la serie no tiene número
que señalar, y arranca el 30 de agosto.

**Cero teléfonos con dos profesionales** es la razón de que el servidor resuelva a la profesional
sin preguntar. Meter un parámetro más en once funciones para servir a cero personas es complejidad
que hoy no se paga.

### 1.2 Las seis fichas

De aquí sale cada plazo que el agente dice en voz alta. La regla 2 no se puede cumplir sin leer esta
tabla en tiempo de ejecución.

| Profesional | Agenda la paciente | Cobro | Aviso de cambio | Anticipación mínima | Modalidad | Datos de pago |
|---|---|---|---:|---:|---|---|
| Araceli | sí | **antes** | 1440 | 2880 | ninguna dirección | **sí** |
| Maricruz | sí | después | 1440 | 1440 | ninguna dirección | no |
| Miranda | sí | después | **720** | 2880 | **las dos** | no |
| Prueba 1 | sí | después | 1440 | 2880 | sólo a en línea | no |
| Prueba 2 | **no** | después | 1440 | 1440 | ninguna dirección | sí |
| Prueba 3 | sí | después | 1440 | 1440 | ninguna dirección | no |

La anticipación para cambiar de modalidad es un campo aparte de la misma ficha. Sus valores no se
leyeron en este corte, así que no se escriben aquí: la función los resuelve en tiempo de ejecución.

Consecuencias medidas:

- **Un texto con «24 horas» adentro le miente a las pacientes de Miranda**, y miente en la dirección
  peligrosa: les promete un plazo más ancho del que tienen. Es el caso concreto que fija la regla 2.
- **Cuatro de seis no permiten ningún cambio de modalidad.** A sus pacientes no se les menciona la
  opción, y por eso `cambiar_modalidad` sólo lista citas que de verdad pueden cambiar.
- **Sólo Araceli cobra por adelantado, y tiene sus datos llenos.** La variante del cierre con banco,
  titular, CLABE y reloj de 24 horas es la que aplica hoy; la de «pídele los datos a tu profesional»
  no le toca a nadie. Ninguna de las dos se ha mandado todavía: el agente nunca ha agendado.
- **Tres de seis piden 48 horas de anticipación.** Una paciente que escribe el martes por una cita
  del miércoles se queda sin opciones, y `buscar_horarios` tiene que decírselo con alternativas de
  verdad, no con un «no hay».

---

## 2. El andamio del agente

### 2.1 Lo que está desplegado

| Dato | Valor al 2026-08-27 |
|---|---|
| Funciones del agente en la base | 13: 9 en `public`, 4 en `private`. **Las 13 son de control. Cero de dominio** |
| Rutas del portal | **27 declaradas, 3 implementadas** |
| Presupuesto por turno | **8 llamadas**, con el ordinal 9 reservado al cierre. **No 12** |
| Dónde vive ese 8 | En cinco objetos que se mueven juntos: el portero, dos `CHECK`, un índice parcial y las dos funciones de cierre |
| Mutaciones por turno | 1 |
| Vigencia | Sesión 24 horas, turno 30 minutos de inactividad |
| Identificadores de opción emitidos | 0 filas, y el registro de llaves vacío: hoy la emisión está bloqueada |
| Puerta de la base | Abierta: el único número declarado está habilitado |
| Última migración aplicada | `20260826162000_professional_payment_details` |

Los tres campos de datos de pago del perfil profesional ya existen y ya están aplicados. Son lo único
de la lista de construcción que se puede tachar hoy: sólo queda usarlos.

### 2.2 Qué contesta el portal y qué rechaza

De las 27 rutas declaradas, contestan **tres**, y son las tres del andamio de control: la de
capacidades, la de marcar la espera y la de cerrar el turno. Hay además una ruta de salud que
responde que el portal está apagado.

**Las otras 24 caen todas en el mismo `403` de operación no habilitada.** No es un error
intermitente ni un permiso mal puesto: es la última línea del despachador. Mientras no se escriban
las once rutas nuevas, cualquier cosa que el agente intente hacer con una cita rebota ahí.

El borde exige `Bearer` con un secreto comparado en tiempo fijo, corta el cuerpo en 1 MB, corta la
respuesta en 16 KB y le da 2 segundos a cada llamada a la base.

### 2.3 La historia de producción, entera

En toda la vida del agente: **4 sesiones, 6 turnos, 6 llamadas, 0 mutaciones y 0 identificadores de
opción**. Las 6 llamadas son dos operaciones repetidas tres veces cada una: la de capacidades en el
ordinal 1 y la de cierre en el ordinal 9. Última actividad: **2026-08-24 21:09 UTC**.

De 10 mensajes entrantes reales, 6 se admitieron y 4 se rechazaron. Quedan dos turnos colgados, uno
en `active` y uno en `admitted`, los dos vencidos por tiempo desde el 24 de agosto: un mensaje nuevo
los expiraría antes de abrir turno y hoy no bloquean nada.

**El agente nunca ha escrito una sola fila de dominio, ni ha hecho una sola pregunta.** Todo lo que
describe esta documentación es, hasta hoy, código sin ejercer.

### 2.4 Dormir y despertar: verificado y nunca ejercido

El mecanismo son trece piezas y está verificado extremo a extremo, con su cerrojo: un turno no se
puede dormir si queda una herramienta a medio terminar.

Y aun así, **nunca ha corrido**:

| Medida | Valor |
|---|---|
| Turnos que llegaron a esperar | **0** de 6 |
| Mensajes admitidos como reanudación | **0** de 10 |

La primera vez que el agente nuevo intente dormirse será la primera vez que ese camino corra de
verdad, en producción, con una paciente esperando del otro lado. Cero invocaciones no vuelve muerta
una pieza: la vuelve no ejercida, y eso es distinto.

---

## 3. Lo que está desplegado y contradice este diseño

### 3.1 Restos del diseño anterior en el código

Esto se dice una sola vez, aquí, y como hecho del código desplegado, no como diseño.

La base todavía carga el estado de identidad `ambiguous` para un teléfono con dos vínculos vivos: lo
escriben la admisión y la función de capacidades, y **ocurre de verdad** —4 de los 10 mensajes reales
se admitieron así y un quinto se rechazó con esa marca—. El portero todavía autoriza la superficie de
formularios y la de medios, `agent_finalize_tool_call` todavía trae la rama de la saga de
cancelar-y-reagendar, y el portal todavía declara esas rutas apagadas.

Nada de eso se ejecuta hoy: las rutas devuelven el `403` y las funciones de dominio que necesitarían
no existen. **Limpiarlo es trabajo del repo `Agenda-Psi-V2`, no de aquí.** Esta documentación deja de
describirlo; el código no se limpia solo.

**Mientras esa migración no exista, ese estado de más se trata como el de vínculo público.** No hace
falta código nuevo para lograrlo: la admisión ya le borra el arrendatario al turno, así que las once
funciones ven un teléfono sin paciente y sin profesional, y contestan `no_te_reconocemos` con
`cierra: true`. El resultado que ve la paciente es el mismo, por el camino que ya está puesto.

### 3.2 Cuatro cerrojos que hoy dicen lo contrario

Todos verificados en la base viva el 2026-08-27. `docs/08-implementacion.md` dice en qué orden se
resuelven; aquí sólo se deja constancia de la distancia.

| Lo que dice el diseño | Lo que está desplegado |
|---|---|
| 12 llamadas por gestión (regla 9) | **8**, y el noveno ordinal reservado al cierre. El tope vive en cinco objetos que se mueven juntos |
| `agendar` escribe la cita | **Crear cita no está en la lista blanca del portero.** Agendar por texto sale rechazado siempre, sin llegar a la base |
| Cada función resuelve el plazo de su profesional (regla 2) | El rol del agente **no tiene permiso de lectura sobre la tabla de políticas**. Hoy ninguna función puede resolver un solo plazo |
| `buscar_horarios` reutiliza el motor de disponibilidad | El rol del agente **no puede ejecutar el motor** ni leer las tablas de bloqueos y conexiones que necesita el verificador de hueco libre |

Y uno más, del lado del borde: la tabla de mensajes entrantes tiene 22 columnas y **ninguna sirve
para guardar un archivo**. Sin eso, `mandar_comprobante` no funciona aunque todo lo demás esté.

---

## 4. Lo que queda abierto

Cinco frentes. Cuatro esperan decisión, con lo que cuesta cada salida; el segundo ya lo cerró Gael
y se deja anotado.

**1. El día que aparezca el primer teléfono con dos profesionales.**
Hoy son cero de 19. El servidor resuelve sin preguntar, en el orden que fija
`docs/07-portero.md`. Salida A:
dejarlo así; cuesta cero hoy, y el día que aparezca el primero puede saludar con el nombre
equivocado durante un mensaje —nunca mover una cita de quien no era, porque las once funciones
vuelven a resolver la identidad por su cuenta—. Salida B: una clave más en las tres funciones que la
necesitarían, más una pregunta en la conversación; cuesta tres funciones y un mensaje extra para
servir hoy a nadie. Se recomienda A, y hacer B el día que aparezca.

**2. La decisión de cobro tardío es difícil de encontrar en la app de la profesional.** *Decidida.*
Hoy es inofensivo porque nadie produce esas decisiones. **El agente las va a producir todas**: la
superficie de la paciente es la única que las abre. Gael ya decidió no arreglarlo en esta ronda: el
aviso a la profesional alcanza para arrancar y la app se optimiza después. Lo que cuesta es que
alguna decisión tarde en encontrarse, sobre dinero suyo. El arreglo, cuando toque, es de la app y no
de este repo.

**3. El comprobante es irreemplazable.**
La base admite un solo comprobante por cobro, para siempre, y no hay pantalla para reemplazarlo. Una
foto equivocada queda pegada. Salida A: dejarlo, y que la única defensa sea la pregunta de
confirmación que `mandar_comprobante` hace siempre; cuesta cero y ya está en el diseño. Salida B:
abrir una vía de reemplazo; cuesta tocar la app y el esquema. Se recomienda A hasta que pase la
primera vez.

**4. Nadie invita a dejar reseña.**
La plantilla existe y está registrada, pero no tiene quien la mande: ni función que la produzca ni
cron. Y la moderación es manual, fuera de la base. Sin invitación, `dejar_resena` es una función que
nadie va a llamar nunca. Salida A: dejar la función escrita y esperar; cuesta cero y no rompe nada,
porque el texto de agradecimiento no promete publicación. Salida B: darle productor a la invitación;
cuesta una migración del lado del dominio y decidir quién modera y cada cuánto.

**5. El prepago se salva hoy por accidente.**
La única profesional que cobra por adelantado pide 48 horas de anticipación, así que sus citas caen
fuera de la ventana que decide si una cita nace ya confirmada. El día que baje ese margen, el
comprobante deja de pedirse **y no da ningún error**. Salida A: arreglar la ventana para que mire el
momento del cobro; cuesta una migración pequeña. Salida B: dejarlo y vigilar el margen; cuesta un
fallo silencioso el día que alguien cambie un número en una pantalla de ajustes. Se recomienda A.

Queda además una decisión chica: a cuánto se sube la ventana de agrupamiento para que los cinco
mensajes seguidos lleguen juntos, que es lo que `mis_citas` espera. El número no está decidido, y el
valor de hoy sale de la bajada de Kapso del 2026-08-26, no de una lectura nueva. Sólo se toca después
de que el código acepte lotes; el orden está en `docs/08-implementacion.md`.

---

## 5. Lo que no se pudo comprobar

Se dice, no se estima.

**Los dos interruptores del borde.** Las variables de entorno que encienden la admisión y el
workflow son de las funciones de borde y no se leen por SQL ni por el API de funciones. **No se pudo
comprobar en qué estado están.** Lo que sí se ve: la puerta de la base está abierta —el único número
declarado está habilitado—, así que si el borde se encendiera, la admisión no lo frenaría.

**Todo lo de Kapso.** La llave del entorno está caducada y el servidor de la plataforma pide una
autorización que esta sesión no puede dar. Los números de Kapso que se citan en el resto del repo —un
workflow con tres nodos y dos aristas, el modelo y sus topes de 16 iteraciones y 2048 tokens, cuatro
funciones de las cinco que admite el plan, 18 plantillas en Kapso y Meta contra las 16 de la base—
salen de la bajada del **2026-08-26** y **no se releyeron hoy**. Antes de diagnosticar cualquier cosa
del lado de Kapso hay que volver a bajarlos: el pseudocódigo del repo no es fuente de verdad ahí.

**El plan de Kapso.** Ni la interfaz de línea de comandos ni el API exponen plan ni facturación. El
tope de cinco scripts sale de la base de conocimiento de la plataforma, no de una lectura de este
proyecto. Se usan cuatro y queda un lugar libre; las once funciones caben en ese lugar porque cuelgan
de una sola función que despacha por ruta.

**El segundo presupuesto del proveedor.** Existe un tope de pasos por ejecución, distinto y superior
al de iteraciones, con guardia de bucle. **La cifra no está documentada** y no se pudo leer.

**El costo real de una gestión.** El presupuesto de 12 llamadas está calculado, flujo por flujo, en
`docs/01-conversaciones.md`, pero **nunca se ha medido contra una conversación de verdad**: hay cero
mutaciones en toda la historia y ningún turno pasó de una llamada útil. El primer mes de producción
es la única forma de saber si el margen entre 8 y 12 alcanza.
