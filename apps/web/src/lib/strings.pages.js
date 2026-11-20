// Words for the Learn page, the Privacy page and the Learn page's county notes (keys
// "learn.", "privacy.", "regions."). Merged into lib/strings.js. A **double-starred** piece
// is shown in bold (features/learn/Bold.jsx). The health departments' own violation text,
// place names and the site's name are never translated.

export const en = {
  // ── Learn page: top ──
  "learn.title": "Understanding Louisville Food Inspections",
  "learn.sub":
    "How Louisville Metro Public Health and Wellness scores an inspection and decides which placard a place has to post.",
  "learn.placards.h": "The three placards",
  "learn.placards.note":
    "Placards are Louisville Metro's program. Bullitt County posts scores but no letter grades, so its places show a score only.",
  "learn.green": "Green placard",
  "learn.blue": "Blue placard",
  "learn.red": "Red placard",
  "learn.field.score": "Score",
  "learn.field.and": "And",
  "learn.field.basedOn": "Based on",
  "learn.field.afterAny": "After any of these",
  "learn.field.or": "Or",
  "learn.a.noPriority": "No priority violations",
  "learn.b.history": "Recent history",
  "learn.b.c1": "Failing 2 inspections in a row",
  "learn.b.c2": "A closure for an imminent health hazard",
  "learn.b.c3": "A regular inspection scored below 60",
  "learn.c.range": "Below 85",
  "learn.c.priority": "One or more priority violations, whatever the score",

  // ── Learn page: callout ──
  "learn.callout.label": "⚠ Score alone does not decide the placard",
  "learn.callout.p1":
    "A place can score 90 and still get a **C (red) placard** if the inspector found a priority violation. A B placard is about history: it is posted once a place passes its follow-up and reopens after a closure, a score below 60, or two failed inspections in a row.",
  "learn.callout.p2":
    "Pin colors on the map show the **score only**, and you can adjust them. A red ring (Louisville's) means at least one violation was cited on the latest inspection. Rings are not placards: the grade in a place's details is the one the health department recorded. Every other Kentucky county's rings are goldenrod: their data lists every form item marked at a visit, including routine ones Louisville's data doesn't publish, so rings are far more common there and don't mean a place is worse. From afar only the places with several violations show a ring; zoom in to see them all.",

  // ── Learn page: duration table ──
  "learn.duration.h": "How long each placard is posted",
  "learn.th.grade": "Grade",
  "learn.th.color": "Color",
  "learn.th.postedFor": "Posted for",
  "learn.th.next": "What comes next",
  "learn.color.green": "Green",
  "learn.color.blue": "Blue",
  "learn.color.red": "Red",
  "learn.a.posted": "Until the next regular inspection",
  "learn.a.next": "The next regular inspection",
  "learn.b.posted": "At least 3 months, at most 6",
  "learn.b.next": "A regular inspection within 3 to 6 months of reopening",
  "learn.c.posted": "At least 7 days, at most 10",
  "learn.c.next": "A follow-up inspection within 7 to 10 days",
  "learn.duration.note":
    "A placard is issued after every scored inspection except opening and survey inspections. A place that moves, covers or alters a B or C placard must keep it up 7 more days. Two failed inspections in a row mean more frequent inspections; three in a row lead to a state hearing and a notice of intent to suspend the permit.",

  // ── Learn page: how the score works ──
  "learn.score.h": "How the score works",
  "learn.score.note":
    "Every inspection starts at 100. Each violation takes off the points the state inspection form sets for that item. Whatever the score, priority violations must be fixed within 10 days.",
  "learn.score.th.score": "Score",
  "learn.score.th.what": "What happens",
  "learn.score.r1": "85 – 100",
  "learn.score.r1.what":
    "Passes (unless there is a priority violation). One-point items are due by the next regular inspection.",
  "learn.score.r2": "70 – 84",
  "learn.score.r2.what": "Fails, C placard. One-point items must be fixed within 30 days.",
  "learn.score.r3": "Below 70",
  "learn.score.r3.what": "The state issues a notice of intent to suspend the permit.",
  "learn.score.r4": "Below 60",
  "learn.score.r4.what":
    "The permit is suspended immediately, as it is for an imminent health hazard.",

  // ── Learn page: violations ──
  "learn.violations.h": "Violations",
  "learn.violations.p":
    "Inspectors cite each problem against a section of the Kentucky Food Code, and each one takes points off the score. The placard policy treats a **priority** violation as an automatic C. It defines one as breaking a rule “whose application contributes directly to the elimination, prevention or reduction to an acceptable level, hazards associated with foodborne illness or injury and there is no other provision that more directly controls the hazard.” The public data this site uses doesn't clearly mark which violations were priority ones, so we list every citation simply as a violation. A place's score and grade come straight from the health department's records.",
  "learn.vdb.h": "Violation database",

  // ── Learn page: about, sources, rules ──
  "learn.about.h": "About this data",
  "learn.about.p":
    "This site is an independent project and is not affiliated with Louisville Metro Government or any county health department. Inspection data comes from each county's public records, listed below. It is refreshed regularly but can lag behind the latest inspections, and it may contain errors. The placard posted at the business and the official inspection report are the final word.",
  "learn.sources.h": "Data sources",
  "learn.sources.note":
    "Each county publishes its inspections differently, so the same details aren't available everywhere.",
  "learn.rules.label": "Rules cited above:",
  "learn.rules.placard": "Louisville Metro Placard Issuance Policy",
  "learn.rules.placardDate": " (approved June 7, 2019); ",
  "learn.rules.code": "Kentucky Food Code, 902 KAR 45:005",
  "learn.privacyLink": "Privacy: what this site stores about you",

  // ── Violation database ──
  "learn.vdb.tl.all": "All time",
  "learn.vdb.tl.all.note": "Every recorded citation since data collection began.",
  "learn.vdb.tl.12mo": "12 months",
  "learn.vdb.tl.12mo.note": "Citations from the past 12 months only.",
  "learn.vdb.tl.6mo": "6 months",
  "learn.vdb.tl.6mo.note": "Citations from the past 6 months only.",
  "learn.vdb.tl.3mo": "3 months",
  "learn.vdb.tl.3mo.note": "Citations from the past 3 months only.",
  "learn.vdb.showing": "Showing",
  "learn.vdb.loading": "Loading violations…",
  "learn.vdb.error": "Error: {message}",
  "learn.vdb.failed": "Failed to load violations",
  "learn.vdb.types": "**{n}** distinct violation types",
  "learn.vdb.search": "Search violations…",
  "learn.vdb.noMatch": 'No violations match "{search}".',
  "learn.vdb.broader": "Try a broader term.",
  "learn.vdb.rowTitle": "Click to see establishments with this violation",
  "learn.vdb.drillTitle": "Establishments with this violation on record",
  "learn.vdb.loadingShort": "Loading…",
  "learn.vdb.drillNone": "No results found in this time window.",
  "learn.vdb.dateCited": "Date cited",
  "learn.vdb.shareTitle": "Share of all citations in this period",
  "learn.vdb.top50": "Showing top 50 results — search to narrow down.",
  "learn.vdb.showAll": "Show all {n} results",
  "learn.vdb.collapse": "Collapse",

  // ── Privacy page ──
  "privacy.title": "Privacy",
  "privacy.updated": "Last updated {date}",
  "privacy.lead":
    "Louisville Food Safe is a free project run by one person. It has no ads and no tracking, and it doesn't sell or share your information. You can use the whole map without an account.",
  "privacy.stored.h": "What is stored",
  "privacy.stored.look.dt": "If you just look at the map",
  "privacy.stored.look.dd":
    "Nothing about you. There are no analytics and no advertising or tracking cookies. Your browser keeps a few things on your own device so the site loads faster and remembers your choices: which counties and place types are switched on, and a copy of the map's data. Clearing your browser's site data removes them.",
  "privacy.stored.account.dt": "If you make an account",
  "privacy.stored.account.dd":
    "Your email address, the places you save, your watch areas (the address or spot you picked and how wide the circle is), and whether you want the weekly email. Signing in is remembered in your browser until you sign out.",
  "privacy.stored.language.dt": "Your language",
  "privacy.stored.language.dd":
    "The language you chose for the site (English or Spanish) is stored with your account, and the weekly email is sent in it.",
  "privacy.stored.email.dt": "If you get the weekly email",
  "privacy.stored.email.dd":
    "The site keeps a log of which emails went to your address and when. It does this by itself, so that nobody is sent the same email twice.",
  "privacy.stored.feedback.dt": "If you send feedback",
  "privacy.stored.feedback.dd":
    "Your message, plus your name and email if you choose to give them. To keep spam out, your browser type and a scrambled form of your IP address are kept with it. The IP address itself is not stored.",
  "privacy.use.h": "What it is used for",
  "privacy.use.p":
    "Only to run the site: signing you in, showing your saved places and watch areas, and sending the weekly digest if you asked for it. Feedback is used to fix and improve the site. People who get the digest may occasionally get another email about the site itself. The digest and those emails each have an unsubscribe link.",
  "privacy.see.h": "Who can see it",
  "privacy.see.p":
    "The person who runs the site can see account emails, saved places, watch areas and feedback. So can the services listed below, as far as each needs to for its job. It is not sold and not used for advertising.",
  "privacy.services.h": "Services the site runs on",
  "privacy.services.intro": "Each one handles only what it needs to do its job:",
  "privacy.services.supabase":
    " stores accounts, saved places, watch areas and feedback, and sends the sign-in code.",
  "privacy.services.netlify": " hosts the site.",
  "privacy.services.google":
    " sends the weekly email (Gmail) and serves the site's lettering (Google Fonts).",
  "privacy.services.geoapify":
    " finds addresses: when you search for one to set a watch area, what you type is sent to it.",
  "privacy.services.carto": " serves the background map, drawn from OpenStreetMap.",
  "privacy.services.ip":
    "As with any website, these services see your IP address when your browser asks them for something.",
  "privacy.choices.h": "Your choices",
  "privacy.choices.stop.dt": "Stop the weekly email",
  "privacy.choices.stop.dd":
    "Use the Unsubscribe link at the bottom of any digest, or the switch in Saved. It takes effect at once.",
  "privacy.choices.remove.dt": "Remove a saved place or a watch area",
  "privacy.choices.remove.dd": "Remove it in Saved. It is deleted straight away.",
  "privacy.choices.delete.dt": "Deleting the account itself",
  "privacy.choices.delete.dd":
    "There is no way to do that yet. Switching the weekly email off and removing your saved places and watch areas leaves your email address and the log of emails sent to it. Nothing is deleted on a schedule: what you don't remove stays.",
  "privacy.data.h": "The inspection data",
  "privacy.data.p":
    "The scores, placards and violations on the map are public records published by the county health departments. They are about businesses, not about you.",
  "privacy.data.link": "About the data",
  "privacy.about.h": "About this page",
  "privacy.about.p1":
    "This page describes the site as it was on the date at the top. To report a problem, use the Feedback button at the top of the site. The site's code is public on ",
  "privacy.about.p2": ", so anyone can check what it does.",

  // ── Counties on the Learn page (lib/regions.js keeps the English; these win when found) ──
  "regions.jefferson.source": "Louisville Metro Open Data",
  "regions.jefferson.dataNote":
    "Every inspection back to about 2016, each with its date, score and A/B/C placard. Each violation names the Food Code item and includes the inspector's comments.",
  "regions.bullitt.source": "Bullitt County Health Department",
  "regions.bullitt.dataNote":
    "Only each place's latest inspection and its follow-up, with no inspection date, no letter grade and no inspector comments: each violation is the name of an item on the inspection form. This site keeps each new score as it appears, so history builds up over time.",
  "regions.oldham.source": "Kentucky's food inspection portal",
  "regions.oldham.dataNote":
    "Only each place's latest inspection and its follow-up, with their dates, from Kentucky's statewide inspection portal, which the health department links to. It lists hotels, pools and schools as well as food service, and a place can have one result per kind of inspection (a school's kitchen and its playground). No letter grade and no inspector comments: each violation is the name of an item on the inspection form. This site keeps each new score as it appears, so history builds up over time.",
  "regions.shelby.source": "Kentucky's food inspection portal",
  "regions.shelby.dataNote":
    "Only each place's latest inspection and its follow-up, with their dates, from Kentucky's statewide inspection portal. It lists hotels, pools and schools as well as food service, and a place can have one result per kind of inspection (a school's kitchen and its playground). No letter grade and no inspector comments: each violation is the name of an item on the inspection form. This site keeps each new score as it appears, so history builds up over time.",
  "regions.spencer.source": "Kentucky's food inspection portal",
  "regions.spencer.dataNote":
    "Only each place's latest inspection and its follow-up, with their dates, from Kentucky's statewide inspection portal. It lists hotels, pools and schools as well as food service, and a place can have one result per kind of inspection (a school's kitchen and its playground). No letter grade and no inspector comments: each violation is the name of an item on the inspection form. This site keeps each new score as it appears, so history builds up over time.",
};

export const es = {
  "learn.title": "Cómo se inspeccionan los alimentos en Louisville",
  "learn.sub":
    "Cómo Louisville Metro Public Health and Wellness califica una inspección y decide qué cartel debe exhibir cada lugar.",
  "learn.placards.h": "Los tres carteles",
  "learn.placards.note":
    "Los carteles son un programa de Louisville Metro. El condado de Bullitt publica puntajes pero no calificaciones con letras, así que sus lugares solo muestran el puntaje.",
  "learn.green": "Cartel verde",
  "learn.blue": "Cartel azul",
  "learn.red": "Cartel rojo",
  "learn.field.score": "Puntaje",
  "learn.field.and": "Y",
  "learn.field.basedOn": "Según",
  "learn.field.afterAny": "Después de cualquiera de estos",
  "learn.field.or": "O",
  "learn.a.noPriority": "Ninguna infracción prioritaria",
  "learn.b.history": "Historial reciente",
  "learn.b.c1": "Reprobar 2 inspecciones seguidas",
  "learn.b.c2": "Un cierre por un peligro inminente para la salud",
  "learn.b.c3": "Una inspección regular con puntaje menor de 60",
  "learn.c.range": "Menos de 85",
  "learn.c.priority": "Una o más infracciones prioritarias, sin importar el puntaje",

  "learn.callout.label": "⚠ El puntaje por sí solo no decide el cartel",
  "learn.callout.p1":
    "Un lugar puede sacar 90 y aun así recibir un **cartel C (rojo)** si el inspector encontró una infracción prioritaria. El cartel B tiene que ver con el historial: se exhibe cuando un lugar pasa su inspección de seguimiento y reabre después de un cierre, de un puntaje menor de 60 o de dos inspecciones reprobadas seguidas.",
  "learn.callout.p2":
    "Los colores de los pines en el mapa muestran **solo el puntaje**, y se pueden ajustar. Un aro rojo (el de Louisville) significa que en la última inspección se citó al menos una infracción. Los aros no son carteles: la calificación en los detalles de un lugar es la que registró el departamento de salud. Los aros de los demás condados de Kentucky son color vara de oro: sus datos enumeran cada punto del formulario marcado en una visita, incluidos los de rutina que los datos de Louisville no publican, así que allí los aros son mucho más comunes y no significan que un lugar sea peor. De lejos, solo los lugares con varias infracciones muestran un aro; acerca el mapa para verlos todos.",

  "learn.duration.h": "Cuánto tiempo se exhibe cada cartel",
  "learn.th.grade": "Calificación",
  "learn.th.color": "Color",
  "learn.th.postedFor": "Se exhibe",
  "learn.th.next": "Lo que sigue",
  "learn.color.green": "Verde",
  "learn.color.blue": "Azul",
  "learn.color.red": "Rojo",
  "learn.a.posted": "Hasta la siguiente inspección regular",
  "learn.a.next": "La siguiente inspección regular",
  "learn.b.posted": "Mínimo 3 meses, máximo 6",
  "learn.b.next": "Una inspección regular entre 3 y 6 meses después de reabrir",
  "learn.c.posted": "Mínimo 7 días, máximo 10",
  "learn.c.next": "Una inspección de seguimiento entre 7 y 10 días después",
  "learn.duration.note":
    "Se emite un cartel después de cada inspección con puntaje, excepto las de apertura y las de sondeo. Un lugar que mueva, tape o altere un cartel B o C debe mantenerlo exhibido 7 días más. Dos inspecciones reprobadas seguidas significan inspecciones más frecuentes; tres seguidas llevan a una audiencia estatal y a un aviso de intención de suspender el permiso.",

  "learn.score.h": "Cómo funciona el puntaje",
  "learn.score.note":
    "Toda inspección empieza en 100. Cada infracción resta los puntos que el formulario estatal de inspección asigna a ese punto. Sin importar el puntaje, las infracciones prioritarias deben corregirse en un plazo de 10 días.",
  "learn.score.th.score": "Puntaje",
  "learn.score.th.what": "Qué pasa",
  "learn.score.r1": "85 – 100",
  "learn.score.r1.what":
    "Aprueba (a menos que haya una infracción prioritaria). Los puntos de un punto deben corregirse antes de la siguiente inspección regular.",
  "learn.score.r2": "70 – 84",
  "learn.score.r2.what":
    "Reprueba, cartel C. Los puntos de un punto deben corregirse en un plazo de 30 días.",
  "learn.score.r3": "Menos de 70",
  "learn.score.r3.what": "El estado emite un aviso de intención de suspender el permiso.",
  "learn.score.r4": "Menos de 60",
  "learn.score.r4.what":
    "El permiso se suspende de inmediato, igual que ante un peligro inminente para la salud.",

  "learn.violations.h": "Infracciones",
  "learn.violations.p":
    "Los inspectores citan cada problema según una sección del Código de Alimentos de Kentucky, y cada uno resta puntos al puntaje. La política de carteles trata una infracción **prioritaria** como una C automática. La define como el incumplimiento de una regla “cuya aplicación contribuye directamente a eliminar, prevenir o reducir a un nivel aceptable los peligros asociados con enfermedades o lesiones transmitidas por alimentos y para la cual no hay otra disposición que controle el peligro más directamente” (traducción libre del texto original en inglés). Los datos públicos que usa este sitio no indican con claridad cuáles infracciones fueron prioritarias, así que mostramos cada citación simplemente como una infracción. El puntaje y la calificación de un lugar vienen directamente de los registros del departamento de salud.",
  "learn.vdb.h": "Base de datos de infracciones",

  "learn.about.h": "Sobre estos datos",
  "learn.about.p":
    "Este sitio es un proyecto independiente y no está afiliado al gobierno de Louisville Metro ni a ningún departamento de salud de condado. Los datos de inspección salen de los registros públicos de cada condado, que se enumeran abajo. Se actualizan con regularidad, pero pueden ir por detrás de las inspecciones más recientes y pueden contener errores. El cartel exhibido en el negocio y el informe oficial de la inspección tienen la última palabra.",
  "learn.sources.h": "Fuentes de datos",
  "learn.sources.note":
    "Cada condado publica sus inspecciones de forma distinta, así que no en todos lados hay los mismos detalles.",
  "learn.rules.label": "Reglas citadas arriba:",
  "learn.rules.placard": "Política de emisión de carteles de Louisville Metro",
  "learn.rules.placardDate": " (aprobada el 7 de junio de 2019); ",
  "learn.rules.code": "Código de Alimentos de Kentucky, 902 KAR 45:005",
  "learn.privacyLink": "Privacidad: qué guarda este sitio sobre ti",

  "learn.vdb.tl.all": "Todo el tiempo",
  "learn.vdb.tl.all.note":
    "Todas las citaciones registradas desde que empezó la recopilación de datos.",
  "learn.vdb.tl.12mo": "12 meses",
  "learn.vdb.tl.12mo.note": "Solo las citaciones de los últimos 12 meses.",
  "learn.vdb.tl.6mo": "6 meses",
  "learn.vdb.tl.6mo.note": "Solo las citaciones de los últimos 6 meses.",
  "learn.vdb.tl.3mo": "3 meses",
  "learn.vdb.tl.3mo.note": "Solo las citaciones de los últimos 3 meses.",
  "learn.vdb.showing": "Mostrando",
  "learn.vdb.loading": "Cargando infracciones…",
  "learn.vdb.error": "Error: {message}",
  "learn.vdb.failed": "No se pudieron cargar las infracciones",
  "learn.vdb.types": "**{n}** tipos distintos de infracción",
  "learn.vdb.search": "Buscar infracciones…",
  "learn.vdb.noMatch": 'Ninguna infracción coincide con "{search}".',
  "learn.vdb.broader": "Prueba con un término más general.",
  "learn.vdb.rowTitle": "Haz clic para ver los establecimientos con esta infracción",
  "learn.vdb.drillTitle": "Establecimientos con esta infracción en su historial",
  "learn.vdb.loadingShort": "Cargando…",
  "learn.vdb.drillNone": "No se encontraron resultados en este periodo.",
  "learn.vdb.dateCited": "Fecha de la citación",
  "learn.vdb.shareTitle": "Parte de todas las citaciones en este periodo",
  "learn.vdb.top50": "Se muestran los primeros 50 resultados; busca para acotar.",
  "learn.vdb.showAll": "Ver los {n} resultados",
  "learn.vdb.collapse": "Contraer",

  "privacy.title": "Privacidad",
  "privacy.updated": "Última actualización: {date}",
  "privacy.lead":
    "Louisville Food Safe es un proyecto gratuito a cargo de una sola persona. No tiene anuncios ni rastreo, y no vende ni comparte tu información. Puedes usar todo el mapa sin una cuenta.",
  "privacy.stored.h": "Qué se guarda",
  "privacy.stored.look.dt": "Si solo miras el mapa",
  "privacy.stored.look.dd":
    "Nada sobre ti. No hay analítica ni cookies de publicidad o de rastreo. Tu navegador guarda algunas cosas en tu propio dispositivo para que el sitio cargue más rápido y recuerde tus elecciones: qué condados y tipos de lugar están activados, y una copia de los datos del mapa. Al borrar los datos del sitio en tu navegador, se eliminan.",
  "privacy.stored.account.dt": "Si creas una cuenta",
  "privacy.stored.account.dd":
    "Tu correo electrónico, los lugares que guardas, tus zonas vigiladas (la dirección o el punto que elegiste y qué tan ancho es el círculo) y si quieres recibir el correo semanal. Tu navegador recuerda que iniciaste sesión hasta que la cierres.",
  "privacy.stored.language.dt": "Tu idioma",
  "privacy.stored.language.dd":
    "El idioma que elegiste para el sitio (inglés o español) se guarda con tu cuenta, y el correo semanal se envía en ese idioma.",
  "privacy.stored.email.dt": "Si recibes el correo semanal",
  "privacy.stored.email.dd":
    "El sitio lleva un registro de qué correos se enviaron a tu dirección y cuándo. Lo hace por sí solo, para que a nadie le llegue dos veces el mismo correo.",
  "privacy.stored.feedback.dt": "Si envías comentarios",
  "privacy.stored.feedback.dd":
    "Tu mensaje, más tu nombre y tu correo si decides darlos. Para evitar el spam, con el mensaje se guardan el tipo de navegador y una versión codificada de tu dirección IP. La dirección IP en sí no se guarda.",
  "privacy.use.h": "Para qué se usa",
  "privacy.use.p":
    "Solo para hacer funcionar el sitio: iniciar tu sesión, mostrar tus lugares guardados y zonas vigiladas, y enviar el resumen semanal si lo pediste. Los comentarios se usan para corregir y mejorar el sitio. Quienes reciben el resumen pueden recibir de vez en cuando otro correo sobre el propio sitio. El resumen y esos correos tienen cada uno un enlace para cancelar la suscripción.",
  "privacy.see.h": "Quién puede verlo",
  "privacy.see.p":
    "La persona que administra el sitio puede ver los correos de las cuentas, los lugares guardados, las zonas vigiladas y los comentarios. Los servicios que se enumeran abajo también, en la medida que cada uno lo necesite para su función. No se vende ni se usa para publicidad.",
  "privacy.services.h": "Servicios en los que funciona el sitio",
  "privacy.services.intro": "Cada uno maneja solo lo que necesita para hacer su trabajo:",
  "privacy.services.supabase":
    " guarda las cuentas, los lugares guardados, las zonas vigiladas y los comentarios, y envía el código de inicio de sesión.",
  "privacy.services.netlify": " aloja el sitio.",
  "privacy.services.google":
    " envía el correo semanal (Gmail) y sirve las letras del sitio (Google Fonts).",
  "privacy.services.geoapify":
    " encuentra direcciones: cuando buscas una para definir una zona vigilada, lo que escribes se le envía.",
  "privacy.services.carto": " sirve el mapa de fondo, dibujado a partir de OpenStreetMap.",
  "privacy.services.ip":
    "Como en cualquier sitio web, estos servicios ven tu dirección IP cuando tu navegador les pide algo.",
  "privacy.choices.h": "Tus opciones",
  "privacy.choices.stop.dt": "Dejar de recibir el correo semanal",
  "privacy.choices.stop.dd":
    "Usa el enlace para cancelar la suscripción al pie de cualquier resumen, o el interruptor en Guardados. Surte efecto al instante.",
  "privacy.choices.remove.dt": "Quitar un lugar guardado o una zona vigilada",
  "privacy.choices.remove.dd": "Quítalo en Guardados. Se borra de inmediato.",
  "privacy.choices.delete.dt": "Eliminar la cuenta",
  "privacy.choices.delete.dd":
    "Todavía no hay forma de hacerlo. Desactivar el correo semanal y quitar tus lugares guardados y zonas vigiladas deja tu correo electrónico y el registro de los correos enviados a él. Nada se borra de forma programada: lo que no quites se queda.",
  "privacy.data.h": "Los datos de inspección",
  "privacy.data.p":
    "Los puntajes, carteles e infracciones del mapa son registros públicos publicados por los departamentos de salud de los condados. Tratan de negocios, no de ti.",
  "privacy.data.link": "Sobre los datos",
  "privacy.about.h": "Sobre esta página",
  "privacy.about.p1":
    "Esta página describe el sitio tal como estaba en la fecha de arriba. Para avisar de un problema, usa el botón de Comentarios en la parte de arriba del sitio. El código del sitio es público en ",
  "privacy.about.p2": ", así que cualquiera puede comprobar lo que hace.",

  "regions.jefferson.source": "Datos abiertos de Louisville Metro",
  "regions.jefferson.dataNote":
    "Todas las inspecciones desde aproximadamente 2016, cada una con su fecha, puntaje y cartel A/B/C. Cada infracción nombra el punto del Código de Alimentos e incluye los comentarios del inspector.",
  "regions.bullitt.source": "Departamento de Salud del Condado de Bullitt",
  "regions.bullitt.dataNote":
    "Solo la última inspección de cada lugar y su seguimiento, sin fecha de inspección, sin calificación con letra y sin comentarios del inspector: cada infracción es el nombre de un punto del formulario de inspección. Este sitio conserva cada puntaje nuevo a medida que aparece, así que el historial se va formando con el tiempo.",
  "regions.oldham.source": "Portal de inspección de alimentos de Kentucky",
  "regions.oldham.dataNote":
    "Solo la última inspección de cada lugar y su seguimiento, con sus fechas, tomadas del portal estatal de inspecciones de Kentucky, al que enlaza el departamento de salud. Incluye hoteles, piscinas y escuelas además de servicio de alimentos, y un lugar puede tener un resultado por cada tipo de inspección (la cocina de una escuela y su patio de juegos). No hay calificación con letra ni comentarios del inspector: cada infracción es el nombre de un punto del formulario de inspección. Este sitio conserva cada puntaje nuevo a medida que aparece, así que el historial se va formando con el tiempo.",
  "regions.shelby.source": "Portal de inspección de alimentos de Kentucky",
  "regions.shelby.dataNote":
    "Solo la última inspección de cada lugar y su seguimiento, con sus fechas, tomadas del portal estatal de inspecciones de Kentucky. Incluye hoteles, piscinas y escuelas además de servicio de alimentos, y un lugar puede tener un resultado por cada tipo de inspección (la cocina de una escuela y su patio de juegos). No hay calificación con letra ni comentarios del inspector: cada infracción es el nombre de un punto del formulario de inspección. Este sitio conserva cada puntaje nuevo a medida que aparece, así que el historial se va formando con el tiempo.",
  "regions.spencer.source": "Portal de inspección de alimentos de Kentucky",
  "regions.spencer.dataNote":
    "Solo la última inspección de cada lugar y su seguimiento, con sus fechas, tomadas del portal estatal de inspecciones de Kentucky. Incluye hoteles, piscinas y escuelas además de servicio de alimentos, y un lugar puede tener un resultado por cada tipo de inspección (la cocina de una escuela y su patio de juegos). No hay calificación con letra ni comentarios del inspector: cada infracción es el nombre de un punto del formulario de inspección. Este sitio conserva cada puntaje nuevo a medida que aparece, así que el historial se va formando con el tiempo.",
};
