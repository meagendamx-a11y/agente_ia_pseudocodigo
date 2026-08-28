# Cómo se edita este repositorio

Aquí vive la documentación del agente de WhatsApp de Agenda Psi: doce archivos en español que dicen
qué hace el agente, qué contesta palabra por palabra y qué falta construir. No hay implementación.
Las migraciones, las funciones de la base y el código de las funciones de borde se escriben y se
aplican en `Agenda-Psi-V2`; aquí se decide qué tienen que hacer. Estas reglas valen igual para una
persona y para un agente. Quien no pueda cumplir una, pregunta antes de escribir.

## 1. Lo que nunca se agrega

- **Migraciones `.sql`.** Se aplican en el repo de la base; una copia aquí envejece sin que nadie se
  entere y termina contradiciendo a lo desplegado.
- **Secretos.** Llaves, tokens, cadenas de conexión: en un repo de documentación no tienen dónde
  caducar.
- **Datos de pacientes.** Ni nombres, ni teléfonos, ni capturas de conversaciones reales. Los
  ejemplos se inventan.
- **Exportaciones vivas.** Un volcado envejece en horas y a la semana es un número inventado con
  aspecto de dato.

Son doce archivos y ni uno más. Cada tema tiene un solo dueño, y el orden de lectura está en
`README.md`. Antes de escribir un párrafo se busca dónde vive ya ese tema: si vive en otro archivo,
se cita en vez de repetirlo.

## 2. La lista cerrada

Estos doce archivos describen un solo agente: el que conversa por texto y contesta con lo que el
servidor ya redactó. Antes hubo otros diseños, y de ninguno queda nada aquí.

**Ninguna pieza de un diseño anterior aparece en ningún archivo.** No se menciona «para contexto»,
no se explica «por si acaso», no va en una nota al pie, ni en un ejemplo, ni en un comentario del
prompt, ni siquiera para decir que se retiró. La regla cubre los nombres propios de esas piezas
—funciones, rutas, estados, herramientas— y también las cifras que la base desmintió después.

La prueba es corta: si un párrafo sólo se entiende contrastándolo con algo que ya no existe, está
mal escrito. Se reescribe diciendo lo que el agente hace hoy, y con eso se acaba. Quien dude de si
algo cae en la lista pregunta antes de escribirlo, porque adivinar aquí sale caro: cada concepto
viejo que sobrevive en un renglón le enseña al siguiente lector una arquitectura que ya nadie va a
construir.

**La única excepción.** `docs/09-estado-y-limites.md` puede nombrar, **una sola vez y como hecho del
código desplegado, no como diseño**, lo del diseño viejo que sigue vivo en la base y en el borde
aunque nadie lo ejecute. Va ahí porque ese archivo existe justo para decir en qué se separaron lo
escrito y lo que corre, y porque limpiarlo es trabajo de `Agenda-Psi-V2`. Ningún otro archivo lo
menciona.

## 3. Los números

Ninguno se escribe sin haberlo leído de la base desplegada. **Ni de memoria, ni de un corte
anterior, ni de otro archivo de este repo.** Lo escrito no es evidencia: lo que un repositorio
declara y lo que corre en producción se separan solos, y con este agente ya se separaron. Si un
número no se pudo verificar, se dice «no se pudo comprobar»: **no se estima, no se redondea y no se
hereda.** Un número con su fecha de corte vale; uno sin fecha, no, y los de
`docs/09-estado-y-limites.md` se vuelven a leer cada vez que ese archivo se toca.

## 4. Los textos

`docs/06-textos.md` es la **única** fuente de lo que la paciente lee. Los demás archivos citan por
clave —«el texto `paciente_inactivo`»— y sólo reproducen la frase cuando la conversación no se
entiende sin ella, en `docs/01-conversaciones.md`. Si una cita y `06` difieren, **manda `06`**, y la
corrección se hace primero ahí. Ningún texto se retoca en dos archivos a la vez: así una frase nunca
tiene dos versiones vivas.

## 5. Los plazos

Ningún plazo se escribe a mano dentro de un texto que la paciente lee. Sale de la ficha de su
profesional y viaja en un hueco. Las profesionales no piden el mismo aviso, así que un «24 horas»
escrito a mano le miente a las pacientes de quien pide menos, y le miente en la dirección peligrosa.
Única excepción: las 24 horas del reloj del prepago, que es un valor fijo del producto.

## 6. El género

Hay pacientes hombres en producción. **Ningún texto asume género en la paciente:** ni «activa» ni
«activo» aplicados a ella; se rodea la frase. A la profesional se le nombra por su nombre de pila,
nunca «él» ni «ella», aunque el nombre se repita dos veces en tres renglones.

## 7. Lo que no se propone

**Nada de lo que se escriba propone borrar tablas, RLS, RPC, triggers, cron, buckets ni ningún
objeto que use la app Flutter.** Si un objeto lo toca la app, se queda. Sin excepciones y sin
matices: varias piezas que parecen del agente por el nombre las escribe o las lee la app dentro de
la misma transacción, y quitarlas rompe cosas que las profesionales usan a diario.
`docs/08-implementacion.md` sólo habla de lo que se construye y de lo que se apaga con un
interruptor.

## 8. El tono

Español de México. Prosa clara y directa, frases cortas, y el **por qué** de cada decisión en la
misma línea o en la siguiente. Sin relleno corporativo, sin emojis, sin exclamaciones, sin «es
importante notar que», sin «en resumen». Nada de accesibilidad opcional, blindajes defensivos ni
soporte de casos que el producto no atiende hoy. Un archivo corto que dice todo es mejor que uno
largo que se repite. Se escribe «la profesional» y «la paciente».

## 9. Mermaid

Sólo dos diagramas en todo el repositorio: el grafo del modelo en `docs/00-el-agente.md` y el
mecanismo de dormir y despertar en `docs/07-portero.md`. Un diagrama por archivo como máximo, y sólo
en esos dos. Sólo `flowchart LR` o `flowchart TD`, sin colores, sin estilos, sin subgrafos anidados.
Las etiquetas van entre comillas, en español y **sin acentos**, porque el renderizador se los come.
Si un diagrama necesita una leyenda para entenderse, no sirve: se escribe en prosa.
