# 08 · La implementación

Corte: 2026-08-27. Todo lo que aquí se llama «hoy» se leyó de la base viva ese día.

Este archivo dice **qué hay que construir, en qué orden y cómo se prueba**. Cómo se comporta el
agente está en `docs/01-conversaciones.md` y `docs/02-funciones.md`; los textos, en
`docs/06-textos.md`. Aquí no se propone borrar nada: lo único que se apaga se apaga con un
interruptor, y los objetos que usa la app de la profesional se quedan enteros (§8).

---

## 1. Lo que hay que hacer, en una página

**Lo que ya está y sólo se retoca.** El andamio de control está desplegado: trece funciones que
admiten el mensaje, sellan teléfono, paciente, profesional y sesión, llevan el libro mayor de
llamadas, duermen y despiertan la conversación, y la cierran. Se ha ejercido muy poco: seis
llamadas en toda su historia y tres fueron el cierre. La mitad de dormir y despertar no ha corrido
nunca, porque ningún turno llegó a esperar: ese mecanismo está verificado extremo a extremo, no
ejercido.

**Lo que no está es todo lo demás.** Ninguna de las once funciones existe. Ninguna de sus rutas
contesta. Ninguna de sus operaciones está autorizada en el portero. El portal declara veintisiete
rutas y contesta tres; las otras veinticuatro devuelven un 403 de operación no habilitada, y ese
403 es hoy una respuesta normal del sistema. Al terminar esta ronda deja de serlo.

| Frente | Qué se construye | Sin esto no arranca |
|---|---|---|
| La base | Las once funciones de dominio, la búsqueda con filtros, los permisos que faltan, el portero con sus once operaciones y su tope de doce, y el arreglo del motor de horarios | Nada |
| El portal | Once rutas nuevas, y las viejas se retiran | El agente llama y recibe 403 |
| La admisión | El sobre del turno, los medios del mensaje entrante y el aviso de tráfico | Los siete desenlaces de cero llamadas y `mandar_comprobante` |
| Kapso | Tres nodos, once herramientas sobre una sola función, el prompt nuevo | El modelo no tiene qué llamar |
| Los datos | Nada nuevo: quien cobra por adelantado ya tiene banco, titular y CLABE llenos. Sólo hay que usarlos | Sin ellos el prepago cierra con el texto de respaldo |

El orden, en una línea: **se apaga el número, se aplica la base, se despliega el portal, se
despliega el webhook, se rehace el workflow, se prende el número, y se recorre el sandbox.**

---

## 2. Cada pieza que hoy no existe

### 2.1 En la base

| Pieza | Qué hace | De qué depende |
|---|---|---|
| **Los permisos de lectura de las políticas por profesional** | Deja que cualquier función resuelva un plazo. Es el bloqueante de la regla 2: sin él ningún texto puede decir el plazo correcto y todos dirían 24 horas | De nada. Va primero |
| **Los dos permisos del motor de disponibilidad** | Ejecutar el núcleo interno de horarios —hoy sólo lo puede ejecutar `postgres`, verificado— y las lecturas que necesita el verificador de hueco libre, que corre con los privilegios de quien lo llama | De nada. Van con los anteriores |
| **El arreglo de la lectura de horarios** | Sube el tope, quita los traslapes y respeta la franja. Hoy toma los primeros seis del día en pasos de quince minutos: un día de 3:00 a 7:00 contesta de 3:00 a 4:15 y las 5:00 no aparecen nunca | De los permisos |
| **La búsqueda con filtros** | Recibe días, fechas y franja, recorre los treinta días del horizonte por dentro, excluye la cita que se mueve, y devuelve hasta cinco opciones o el motivo redactado con alternativas. Es una operación nueva, no un parámetro más | Del arreglo anterior |
| **Las once funciones de dominio** | Todo el catálogo de `docs/02-funciones.md`. Resuelven identidad, candidatas, plazos y precios, mutan una vez y devuelven el texto ya redactado | De los permisos y de la búsqueda |
| **Los avisos con las claves del contrato** | Los seis avisos a la profesional en la misma transacción que la mutación. Hoy las funciones escritas no ponen ni una de las claves que la app necesita: los seis llegarían en blanco, y la push también | De las once |
| **El portero de doce** | Once operaciones, nombradas como las once funciones, ocho capaces de mutar. Sube el tope de ocho a doce y mueve el ordinal del cierre | De nada, pero se aplica con el número apagado (§3) |
| **El alta de crear cita** | Hoy agendar por texto sale rechazado siempre: la operación no está en la lista blanca del portero. Es una línea, y es la que vuelve conversacional al agente | Del portero |
| **La tabla de opciones del turno** | Guarda la equivalencia entre el número que ella dice y la cita real: el nombre de la función, la cita y la posición. Ya existe, ya es del rol del agente, ya caduca con el turno. Su llave foránea apunta a un registro que hoy está vacío, así que la migración siembra esa fila | De nada |
| **Los tres campos de datos de pago** | Banco, titular y CLABE en la ficha profesional. **Ya existen**, aplicados el 2026-08-26. Sólo queda usarlos, y llenarlos: hoy los tienen completos 2 de 6 | De nada |

**La lista de permisos es más larga que los dos renglones de arriba, y conviene tenerla entera.**
Leído de la base el 2026-08-28: el rol del agente no puede iniciar sesión, no es superusuario y
**se salta las políticas de fila**, así que lo único que decide qué alcanza es el privilegio de
tabla —escribir una política para él no sirve de nada—. Sobre el dominio sólo puede leer **siete
tablas** —citas, pacientes, pagos, profesionales, sus perfiles, servicios y los vínculos de
WhatsApp— y ninguna más. Faltan, una por una, las que las once necesitan: `patient_services`, de
donde salen los servicios asignados y el precio preferente; `payment_proofs`, sin la cual «dinero
adentro» no se puede evaluar (regla 10); `whatsapp_outbox`, de donde se reconstruye la pista de la
última plantilla; `recurrence_series`, sin la cual no se colapsa una serie ni se compone el aviso
de recurrencia; los horarios semanales y especiales con sus bloques, más `blocked_slots` y
`professional_connections`, que son las tablas que la pasada barata de la búsqueda lee por su
cuenta; `notifications`, donde se escriben los seis avisos; `payment_events`, donde quedan los
asientos del dinero; y `reviews`. **Y de escritura no tiene ni una**: ni citas, ni pagos, ni
comprobantes, ni avisos, ni reseñas. Tampoco puede ejecutar una sola función del dominio de la
app: de las 136 de `public` y `private` alcanza 20, que son sus trece propias más siete ayudantes
internos.

Dos precisiones que ahorran trabajo. El núcleo de horarios corre con los privilegios de quien lo
creó, así que para él basta el permiso de ejecución y **no hace falta darle las tablas de
horario**; el verificador de hueco libre es al revés y corre con los del que llama, y por eso sí
pide sus lecturas. Y el permiso sobre la cola de salida se puede dar por columna —teléfono,
plantilla, carga, estado y fecha de envío—, que es todo lo que la pista necesita y deja claro que
leer no es encolar (regla 15). Los permisos van en el primer archivo de la migración: sin su
concesión, cada función nueva revienta con permiso denegado la primera vez que corre, y revienta
en producción, no al crearla.

**Una comprobación que no se puede saltar.** Las once operaciones se reclaman como mutación
siempre, porque hasta que la función corre no se sabe si va a escribir. La llamada que no escribe
nada se finaliza como rechazada antes de escribir, y esa finalización **no debe consumir la
mutación del turno**. Hay que verificarlo en el cuerpo desplegado antes de dar el portero por
bueno: si lo consumiera, una paciente que pregunta y luego decide se quedaría sin poder agendar.

### 2.2 En el borde

| Pieza | Qué hace | De qué depende |
|---|---|---|
| **El sobre del turno** | La admisión compone las cinco claves —paciente, profesional, estado, menú y la pista de la última plantilla— con lo que ya resolvió para sellar el turno. No es una llamada: no gasta presupuesto y no puede fallar por tope | De nada. Es la pieza de la que dependen los siete desenlaces de cero llamadas |
| **Los medios del mensaje entrante** | Descargar y guardar la foto o el PDF. Hoy no hay una sola línea de descarga ni de almacenamiento, y la tabla de mensajes entrantes no tiene ni una columna donde guardar los campos del archivo (verificado: veintidós columnas, ninguna de archivo) | De nada, pero `mandar_comprobante` no funciona sin esto aunque todo lo demás esté |
| **Las once rutas del portal** | Una por función, más las dos del workflow. Las viejas se retiran, y con ellas el 403 como respuesta normal | De las once funciones |
| **El aviso de tráfico** | Hoy la admisión marca el rechazo y ahí se acaba: ella no recibe nada. El borde tiene que mandar el texto `vas_muy_rapido` | De nada |

### 2.3 En Kapso

| Pieza | Qué hace | De qué depende |
|---|---|---|
| **El sobre viaja del nodo de inicio al nodo agente** | Es lo que le permite saludar por su nombre, nombrar a su profesional y ofrecer sólo lo que esa profesional permite, sin gastar una llamada | Del sobre (§2.2) |
| **Las once herramientas** | Una por intención, con el nombre de la intención. Las once cuelgan de una sola función de Kapso, que despacha por ruta | Del portal |
| **El prompt nuevo** | `docs/05-prompt.md`, completo. Trae adentro, literales, los siete textos que el agente manda sin llamar a nada | De los textos |
| **El agrupamiento de mensajes** | La ventana de espera del workflow está hoy en un segundo. Subirla es lo que junta los cinco mensajes seguidos en una sola lectura, y se sube **después** de que el código acepte un lote | De todo lo demás. Va al final |

---

## 3. La secuencia de despliegue, y la razón de cada posición

| # | Paso | Por qué va aquí |
|---|---|---|
| 1 | **Apagar el número** en la tabla de encendido de la admisión | El paso 2 quita autorizaciones. Con el destino apagado no puede existir un turno a medio camino mientras el catálogo cambia. Hoy no hay tráfico y sería inofensivo: el hábito es lo que lo vuelve seguro la próxima vez |
| 2 | **Aplicar la base**, en orden de nombre | Permisos y ayudantes primero; sin sus concesiones las funciones se crean y revientan con permiso denegado la primera vez que corren. Después las lecturas, el dinero, las mutaciones, el portero y la búsqueda |
| 3 | **Desplegar el portal** con las once rutas | Pegado al paso 2, y por una razón exacta: la única ruta de herramienta que el portal contesta hoy deja de estar autorizada en el instante en que se aplica el portero. Entre los dos pasos, el agente no puede trabajar — por eso el número está apagado desde el paso 1 |
| 4 | **Desplegar el webhook** con medios y con el aviso de tráfico | Después del portal porque no depende de él, y antes de Kapso porque el archivo tiene que estar guardado cuando la función lo vaya a buscar |
| 5 | **Rehacer el workflow** (§4) | Al final del lado del código: una herramienta que Kapso declare y el portal no conteste devuelve 403, y el modelo aprende a no usarla |
| 6 | **Prender el número** | Es la única acción que vuelve a admitir tráfico. Va última |
| 7 | **Recorrido de aceptación** en el sandbox (§6.4) | Con el número prendido y con el juego de datos sembrado |

**Tres dependencias duras que no se pueden reordenar.** Los permisos antes que todo. Los campos de
datos de pago antes que la función que los lee —sobre producción da igual, porque las tres columnas
ya están, pero sobre una base limpia la consulta no compila—. Y los cinco objetos del tope en la
misma migración, por lo que sigue.

### El tope vive en cinco objetos y los cinco se mueven juntos

El presupuesto desplegado es **ocho**, no doce, y el ordinal del cierre es **nueve**. Esos dos
números están escritos a mano en cinco lugares, los cinco leídos de la base hoy:

1. el cuerpo del portero: `tool_call_count >= 8` y el ordinal reservado del cierre;
2. `CHECK agent_turns_tool_call_count_check`: `tool_call_count <= 8`;
3. `CHECK agent_tool_calls_check`: ordinales 1..8, y el 9 en exclusiva para el cierre;
4. el índice único parcial del cierre, que filtra `ordinal = 9`;
5. las comprobaciones del ordinal en las dos funciones de cierre.

Mover sólo el primero y el último deja el sistema así: **la novena llamada aborta** contra el
`CHECK` de los turnos —y aborta después de insertar el renglón, así que se va atrás la transacción
entera— y **el cierre en el trece aborta** contra el `CHECK` de las llamadas, con lo que ninguna
gestión vuelve a cerrarse. Los cinco van en el mismo archivo: los tres de esquema al principio y
los otros dos en el cuerpo de las funciones.

**Y una letra chica que cuesta la migración entera.** El `CHECK` nuevo de las llamadas tiene que
entrar sin validar las filas viejas: en producción hay **tres renglones con ordinal 9** —los tres
cierres de agosto— y contra el `CHECK` nuevo valen falso. Un alta normal revisa lo viejo y aborta
todo. El de los turnos sí se valida: es más laxo que el que sustituye.

---

## 4. Qué hay que hacer en Kapso

> **Antes de tocar nada, se baja.** El JSON del repositorio ya mintió una vez: el nodo desplegado
> no era el declarado. Y al empujar, **los nodos y las aristas son conjuntos de reemplazo**: mandar
> un nodo borra los demás. Una sola fuente de verdad por workflow, y la definición se manda
> completa.

### Los tres nodos

Hay exactamente un workflow, con tres nodos y dos aristas, y esa forma no cambia.

| Nodo | Qué se le hace |
|---|---|
| **Inicio** | Pasar el sobre del turno como variables al nodo agente. Es lo único que cambia, y es lo que hace posible que los textos de borde no cuesten ninguna llamada |
| **Agente** | Prompt nuevo, once herramientas nuevas, y los números de abajo revisados |
| **Cierre** | Se queda tal cual. Es la función que cierra el turno, vive fuera del presupuesto, y ya funcionó tres veces en producción |

### Los números del nodo que hay que revisar antes de encender

| Ajuste | Hoy | Qué hacer | Razón |
|---|---|---|---|
| Iteraciones máximas | 16 | **Subirlo** | Doce llamadas más sus mensajes no caben con holgura en dieciséis. El valor por omisión de la plataforma es 80 |
| Tope de salida del modelo | 2048 | **Revisarlo con los textos reales** | Un texto de mil caracteres más la lista numerada cabe, pero está más justo de lo que parece |
| Entrega sólo por herramienta | encendida | **Se queda** | No es estilístico: si el agente termina un turno con texto plano, el texto se suprime y la llamada siguiente al modelo puede fallar |
| Caché del prompt | 5 minutos | **Se queda** | Una hora se acepta en la API pero el runtime no la pide al proveedor |
| Temperatura | 0 | **Se queda** | No es la razón de que el agente sea predecible. La razón es que no decide nada: el texto le llega escrito |
| Ventana de agrupamiento | 1 segundo | **Se sube al final** | Es el agrupamiento real de nuestra entrada. Sube cuando el código acepte un lote, no antes |
| Agrupamiento del webhook | apagado | **Sigue apagado** | Un lote listo para enviar puede tratarse como basura de limpieza y desaparecer sin dejar fila |

Las herramientas nativas encendidas se quedan en las tres que el mecanismo usa: la de mandar el
mensaje, la de terminar la tarea y la de dormir el turno.

### Las once herramientas sobre una sola función

Una función de Kapso es un script de Cloudflare. El plan admite **cinco** y hoy se usan **cuatro**:
once funciones no caben, **once rutas sí**. Las once herramientas apuntan a la misma función, y esa
función escoge la ruta del portal.

**Cómo sabe de cuál viene.** No por la forma del cuerpo: tres herramientas mandan exactamente la
misma clave —`confirmar`, `pasar_pago` y `mandar_comprobante` sólo llevan `cita`— y serían
indistinguibles. Cada herramienta declara una clave más, con un enum de un solo valor, que nombra
la función. El modelo no puede equivocarla porque no tiene de dónde escoger, y el despacho es una
tabla de once renglones. **Se comprueba contra un sobre real antes de escribir el código.**

El identificador de la ejecución y el del mensaje **no los escribe el modelo**: los inyecta el
workflow desde el contexto. Eso es lo que ata una llamada a un turno sellado.

### Las rutas de la función de borde

| Herramienta | Ruta |
|---|---|
| `ver_servicios` | `/tools/ver-servicios` |
| `buscar_horarios` | `/tools/buscar-horarios` |
| `agendar` | `/tools/agendar` |
| `confirmar` | `/tools/confirmar` |
| `reprogramar` | `/tools/reprogramar` |
| `cancelar` | `/tools/cancelar` |
| `cambiar_modalidad` | `/tools/cambiar-modalidad` |
| `pasar_pago` | `/tools/pasar-pago` |
| `mandar_comprobante` | `/tools/mandar-comprobante` |
| `dejar_resena` | `/tools/dejar-resena` |
| `mis_citas` | `/tools/mis-citas` |

Más las dos del workflow —dormir y cerrar— y la de salud. **Trece rutas y su salud**, contra las
veintisiete declaradas de hoy. El portal no arma frases: los textos vienen redactados de la base y
él los deja pasar. Lo único que valida es la forma, y ahí sí acota los arreglos —siete días de la
semana, cinco fechas— porque el tope tiene que estar en los dos lados.

---

## 5. Las trampas que ya costaron caro

| Trampa | La regla que evita repetirla |
|---|---|
| El pseudocódigo del repositorio miente sobre Kapso: el nodo desplegado no era el declarado | Se baja antes de diagnosticar cualquier cosa. El repositorio no es evidencia de lo desplegado |
| Al empujar, mandar un nodo borra los demás | La definición se manda completa, siempre, desde una sola fuente de verdad |
| Desactivar el workflow «un momento» | **Nunca como paso intermedio.** Mientras está desactivado, cada mensaje entrante muere en el borde y nadie contesta. La palanca barata es otra (§7) |
| Tocar el proveedor de WhatsApp del inicio de sesión creyendo que es del agente | Es el único modo de entrar a la app. No se toca por ninguna razón |
| Dar por muerta una pieza porque no tiene invocaciones | La bitácora prueba lo que se usó, no lo que está configurado. Cero invocaciones no vuelve muerta a una pieza: la vuelve **no ejercida**. Antes de retirar algo se lee su configuración, no su bitácora |
| Añadir una plantilla nueva | Exige migrar el catálogo de la base. Una clave desconocida revienta la inserción en la cola de salida, y el aviso no sale |
| El prepago se salva hoy por accidente | La única profesional que cobra antes pide 48 horas de anticipación, así que sus citas caen fuera de la ventana que decide si la cita nace confirmada. **El día que baje ese margen, el prepago deja de pedirse y no da ningún error.** El comportamiento correcto no puede depender de ese número: la cita de prepago nace sin confirmar siempre |
| «24 horas» en un texto del aviso automático | La ventana real es **26 horas**: es una constante del cron, no una política. Los textos a la profesional siguen diciendo 24, y esa diferencia se deja como está |

---

## 6. El plan de pruebas

### 6.1 Primero hay que sembrar datos

Hoy no hay con qué probar la mitad de lo que se construye. Leído de la base el 2026-08-27:
**cero comprobantes en toda la historia**, **una** serie de recurrencia, **tres** cobros esperando
comprobante y **cero** mutaciones del agente. Sí hay treinta citas futuras vivas, así que la
agenda no está vacía.

Las ramas de recurrencia, de comprobante recibido y de traslado del pago se escribirían sin un solo
dato que las ejercite. Ése es el riesgo real de la ronda y no se tapa leyendo más.

**Juego mínimo, en una rama, nunca en producción:** dos series —una con la próxima ocurrencia
movida a otro día, para ejercitar el aviso de que quedó en otra fecha—, una cita suelta del mismo
servicio que una serie (destino de `pasar_pago`), un comprobante recibido y un prepago con la
petición sellada hace veinticinco horas. Y comprobar que en la rama sigan llenos los datos de
transferencia de quien cobra por adelantado: sin ellos lo que se prueba es el texto de respaldo y
no el que importa.

**Un ajuste más en la rama.** A quien cobra por adelantado hay que bajarle la anticipación mínima,
que hoy es de 48 horas. Con ese margen ninguna de sus citas cae dentro de la ventana del aviso
automático, y ésa es justo la ventana donde se ve si la cita de prepago nace sin confirmar (§6.3,
punto 5).

### 6.2 Qué demuestra y qué no cada vía

| Vía | Demuestra | **No** demuestra |
|---|---|---|
| Pruebas en la base, en una rama | Los permisos exactos, la matriz del dinero columna por columna, los cerrojos del portero, la idempotencia, y que los avisos llevan las claves del contrato | Nada del modelo, nada del sobre, nada del texto |
| El modal de prueba del tablero | Que el nodo corre y que el modelo elige herramienta | Usa variables de entorno de desarrollo, no de producción, y no está documentado qué inyecta ni si sustituye el mensaje. Sólo sirve si se abre la ejecución y se compara la carga de cada llamada contra lo esperado |
| Disparo por API | El sobre real, el envío real, el agente real | Ni webhook, ni agrupamiento, ni disparador de entrante. **Nunca sin el número de teléfono explícito:** sin él la plataforma cae al primer número del proyecto y un mensaje real posterior puede reanudar la ejecución equivocada |
| Reanudación por API | Que la conversación dormida despierta | Sólo esa ruta. Y lo que entra por ahí llega envuelto y marcado como venido de sistemas externos, no de la paciente: si el prompt supone que todo lo que entra es de ella, cambia de tono justo en el turno que más importa |
| Invocar la función suelta | Que el manejador no revienta | Manda el cuerpo tal cual, sin el sobre del nodo. Si el manejador lee una clave anidada y se prueba con la clave en la raíz, la prueba pasa y producción falla |
| **El sandbox de WhatsApp** | Todo: webhook, agrupamiento, disparador, agente, sobre y envío | Nada. Es la única vía que ejerce la inyección de un mensaje en un agente **ya corriendo**, que es un camino distinto de la reanudación |

**La regla que sale de la tabla:** el sandbox no es opcional.

### 6.3 Cómo se prueba cada pieza

1. **El presupuesto y el cierre.** Doce llamadas pasan, la trece se rechaza por tope, y el cierre
   entra en su ordinal. Es la prueba que atrapa el fallo de haber movido el número en un solo lugar.
2. **El catálogo del portero.** Las once operaciones se autorizan; cualquier otra se rechaza y no
   deja fila. Y la llamada que no escribe nada se finaliza como rechazada **sin** consumir la
   mutación del turno: después de ella, mutar sigue siendo posible.
3. **La matriz del dinero.** Cancelar y reprogramar contra los cinco estados del cobro, a tiempo y
   tarde. Es la única prueba que verifica que el dinero no se evapora en ninguna esquina.
4. **La búsqueda vacía.** Un juego de datos por cada uno de los cinco motivos, y el aserto es que
   cada motivo **trae alternativas de verdad**, no sólo que el motivo es el correcto.
5. **El reloj del prepago.** Agendar con quien cobra por adelantado deja el cobro con la petición
   sellada en ese instante y la cita sin confirmar, aunque la sesión sea mañana.
6. **Los avisos.** Los seis llevan las claves del contrato, y el del comprobante **no lleva el
   monto**.
7. **La ruta del comprobante contesta.** Es una prueba de borde, no de base, y existe porque el
   camino del archivo es el único que cruza las tres superficies.

### 6.4 El recorrido de aceptación

Once conversaciones en el sandbox, con el juego de datos sembrado. Cada una se aprueba mirando tres
cosas a la vez: el texto que recibió la paciente, los eventos de la ejecución, y el estado en la
base.

| # | Conversación | Qué tiene que pasar |
|---|---|---|
| 1 | «Quiero agendar» → servicio → filtros → escoge | **Tres llamadas, no más.** La cita nace, la profesional recibe un aviso con nombre y hora, y en ningún momento se ofreció una lista de días |
| 2 | Lo mismo con quien cobra por adelantado | La cita nace **sin confirmar** aunque sea para mañana, el cobro nace con la petición sellada, y el mensaje trae banco, titular, CLABE y el reloj de 24 horas |
| 3 | Manda una foto | Se le pregunta **antes** de pegarla, aunque haya un solo cobro esperando. El cierre dice «recibí tu comprobante», nunca «pagado» |
| 4 | «Cancélala» sobre una con comprobante | **No se cancela.** Se le ofrecen las dos salidas; si insiste, el agente no cede y le dice que eso lo resuelve su profesional |
| 5 | «Muévela», sin tiempo mínimo, con la profesional que pide 12 horas | El aviso dice **12**, no 24, y llega **antes** de mover. El cierre no lo repite |
| 6 | «¿La puedo tomar en línea?» con quien no permite esa dirección | Se le dice que no y cuál se queda. Y en la conversación anterior esa opción no se mencionó nunca |
| 7 | «El sábado a las 9» con quien no trabaja sábados | El motivo llega con alternativas numeradas de verdad, no con una pregunta abierta |
| 8 | Cinco mensajes seguidos | Llegan agrupados y el agente lee la intención completa, sin contestar cinco veces |
| 9 | Un teléfono sin ningún vínculo, y otro dado de baja | Cada uno recibe su texto y el turno cierra. **Una llamada, la que ya se hizo** |
| 10 | «5 estrellas» y el comentario en un segundo mensaje | **Una sola llamada**, al final. La pregunta intermedia no llama a nada |
| 11 | Un mensaje de crisis | El texto sale **con el servidor caído**. Cero llamadas |

**Criterio de fracaso, no de éxito.** Si en cualquiera de las once el agente dice una fecha que no
salió de una etiqueta del servidor, o dice «24 horas» a una paciente cuya profesional pide 12, o
dice «pagado», o dice «listo» de algo que no se escribió, el recorrido no pasa aunque la base haya
quedado bien.

---

## 7. Cómo se apaga si algo sale mal

Tres palancas, de la más barata a la más cara. **La primera resuelve casi todo.**

**1. El interruptor de la función de borde.** Es una variable de entorno del webhook de entrada.
Apagado, contesta que está deshabilitado y **no rompe el webhook**: la plataforma recibe su 200, no
reintenta, no acumula fallos y no se auto-pausa. Segundos, sin desplegar nada, reversible.

**2. Apagar el número en la admisión.** La fila del destino en la tabla de encendido. La admisión
deja de aceptar mensajes para ese número sin borrar ni revertir nada. Es la palanca del despliegue
(§3, paso 1) y sirve igual para una emergencia. Un matiz honesto: apagar el número no cierra por sí
solo los turnos que ya estén vivos.

**3. Revertir las cuatro funciones del portero.** Es la única reversión que hace falta y la única
que es limpia: reclamar, finalizar y las dos del cierre. **Antes de aplicar se guardan sus cuerpos
actuales.** Volver a ponerlos deja las funciones nuevas desplegadas pero inalcanzables, porque el
catálogo viejo no las nombra. No borra nada y no deja ninguna transacción a medias.

**Las tres son globales, y no hay una cuarta por profesional.** La tabla de encendido va por
número de teléfono y el número es uno para todo el producto, así que apagar deja fuera a las seis
a la vez. El único interruptor por profesional que existe es el del agendado por parte de la
paciente, y **sólo se puede prender**: lo escriben las dos funciones que guardan horarios y las
dos lo ponen en verdadero; ninguna función desplegada lo apaga (verificado el 2026-08-28). La
única que hoy lo tiene apagado lo va a perder en cuanto guarde su primer horario, y nadie va a
decidirlo.

> **Lo que nunca se hace: desactivar el workflow.** Mientras está desactivado, cada mensaje
> entrante muere en el borde y la paciente no recibe nada, ni siquiera un texto de disculpa. Es más
> caro que cualquiera de las tres palancas y no arregla nada que ellas no arreglen.

| Síntoma | Dónde se ve | Palanca |
|---|---|---|
| Ninguna gestión cierra | Turnos que se quedan en el estado de cierre sin terminar | 3. Es el ordinal del cierre, movido a medias |
| El modelo dice que lo hizo y no hay fila | Los eventos de la ejecución: si no hay evento de llamada, fue decisión del modelo, no un registro perdido | Revisar el prompt. La regla de `hecho` es lo que lo previene |
| Ejecuciones que mueren tras muchos turnos | El evento de ejecución fallida | La plataforma tiene un presupuesto de pasos por ejecución distinto y superior al de iteraciones, y su cifra no está documentada |
| El agente parece escribir y no sale mensaje | Créditos de inteligencia agotados: son un libro contable distinto del de los mensajes | Recargar. No es un defecto |

---

## 8. Qué se apaga y qué no se toca

**Lo único que se apaga son interruptores**, y son los tres de arriba. Nada de esta ronda propone
borrar una tabla, una política, una función de la app, un trigger, un cron ni un bucket.

**Los rieles compartidos se quedan enteros, y hay que decir por qué**, porque los cinco llevan
nombres que suenan al agente y no lo son:

| Riel | Por qué se queda |
|---|---|
| La cola de salida de WhatsApp | Doce funciones escriben en ella dentro de la misma transacción: nueve de la app, dos cron y el trigger de bienvenida. Sin ella, cancelar, reprogramar, marcar asistencia, pedir comprobante y dar de baja dejan de guardar |
| El vínculo de WhatsApp | Crear un paciente lo inserta por trigger, y editar su teléfono falla con error si no encuentra su renglón. Vaciarla rompe partes de la app que se usan todos los días |
| La tabla de trabajos | La escriben nueve funciones de la app. Que hoy nadie la consuma no la vuelve prescindible |
| La tabla de mensajes entrantes, entera | Seis de sus columnas las leen las dos mitades del mecanismo de dormir y despertar, y otras dos son la idempotencia del webhook |
| Los comprobantes y su bucket | Nacieron antes que el agente. Diecinueve funciones del dominio los tocan |

Y dos que se quedan por una razón más directa:

- **El reloj de la última entrada.** La admisión del agente es la única cosa en toda la base que
  refresca ese dato, y una función de la app lo lee para decidir su ventana de veinticuatro horas.
  Apagar la admisión lo congela, y esa consecuencia se acepta a sabiendas o no se apaga.
- **El proveedor de WhatsApp del inicio de sesión.** No es del agente. Es el único modo de entrar a
  la app, y apagarlo deja a todos fuera.

El día que algo de esto haya que limpiar de verdad —autorizaciones viejas, rutas apagadas—, es
trabajo del repositorio de la app y no de esta ronda. Aquí sólo se construye y se enciende.
