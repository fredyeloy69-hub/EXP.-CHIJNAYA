# Visor - Expediente Técnico C.S. Chijnaya

Monitorea en tiempo real la carga de documentos en el Drive del expediente,
valida que cada carpeta final tenga PDF + editable, y lleva un log de auditoría.

## 1. Google Cloud - Service Account
1. https://console.cloud.google.com → crear/seleccionar proyecto
2. "APIs & Services" → "Library" → habilitar **Google Drive API**
3. "APIs & Services" → "Credentials" → "Create Credentials" → **Service Account**
4. Entrar al Service Account creado → "Keys" → "Add Key" → JSON → se descarga un archivo
5. Copiar el email del Service Account (termina en `.iam.gserviceaccount.com`)
6. En Google Drive, compartir la carpeta raíz del expediente con ese email (permiso Lector)

## 2. Firebase
1. https://console.firebase.google.com → crear proyecto (o usar uno existente)
2. Firestore Database → crear en modo producción
3. Ir a "Configuración del proyecto" → "Cuentas de servicio" → "Generar nueva clave privada" (esto da el JSON para `FIREBASE_SERVICE_ACCOUNT_KEY`)
4. Ir a "Configuración del proyecto" → "General" → agregar una Web App → copiar el `firebaseConfig` (esto llena las variables `NEXT_PUBLIC_FIREBASE_*`)
5. Subir `firestore.rules` incluido en este repo (Firestore → Reglas → pegar contenido → Publicar)

## 3. Variables de entorno
Copiar `.env.example` a `.env.local` y completar todos los valores.
Ojo: `GOOGLE_SERVICE_ACCOUNT_KEY` y `FIREBASE_SERVICE_ACCOUNT_KEY` van como el JSON completo
en una sola línea (podés usar `JSON.stringify` o simplemente pegarlo sin saltos de línea).

## 4. Deploy en Vercel
1. Subir este repo a GitHub
2. Importar el repo en Vercel
3. En "Environment Variables" del proyecto Vercel, cargar TODAS las variables de `.env.example`
4. Deploy. Los Cron Jobs de `vercel.json` se activan solos (cada 10 min, ajustable)
5. Vercel manda automáticamente el header `Authorization: Bearer $CRON_SECRET` en cada ejecución del cron — no hace falta configurarlo aparte

## 5. Primera sincronización manual
Antes de esperar los 10 minutos del cron, podés disparar la primera sync a mano:
```
curl -H "Authorization: Bearer TU_CRON_SECRET" https://tu-proyecto.vercel.app/api/sync
```

## Notas / límites conocidos
- **Quién borró un archivo o carpeta**: la API estándar de Drive (v3) no informa quién
  eliminó algo, solo detecta que ya no está. El campo queda como "Desconocido" en ese caso.
  Para saber el autor exacto de un borrado hace falta la **Drive Activity API**, que ya
  dejé habilitada en `lib/googleDrive.js` (`getActivityClient`) pero no integrada al 100% —
  si esto es importante para vos, lo sumamos como siguiente paso.
- **Archivo "editable"**: hoy cuenta cualquier `.xlsx/.xls/.docx/.doc`, sin distinguir
  por especialidad. Si cada especialidad exige un tipo específico, pasame el mapeo
  (ej: "Estructuras" → Excel, "Arquitectura" → Word) y lo reflejo en `lib/syncEngine.js`.
- El snapshot completo del árbol se guarda en un solo documento (`_meta/snapshot`).
  Firestore tiene un límite de 1MB por documento — para expedientes de cientos de
  carpetas/archivos no hay problema, pero si crece mucho más lo particionamos.
