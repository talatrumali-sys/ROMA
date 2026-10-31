# تحدّي التوقعات — مشروع نظيف

## محتويات المشروع
- تطبيق ويب عربي RTL يعمل كتطبيق Android عبر Capacitor.
- تسجيل حسابات بالبريد وكلمة المرور.
- مباريات وتوقعات وترتيب ونقاط.
- لوحة مدير لإضافة المباريات وإغلاق التوقعات وإدخال النتائج.
- SQL لإنشاء الجداول وسياسات الوصول.
- GitHub Actions لبناء APK تلقائيًا.

## 1) إعداد Supabase
1. أنشئ مشروعًا جديدًا في Supabase.
2. افتح SQL Editor ثم New query.
3. انسخ محتوى `supabase-setup.sql` كاملًا وشغّله مرة واحدة.
4. من Project Settings > API انسخ Project URL وPublishable key.
5. لا تستخدم Secret key أو service_role key في التطبيق.

## 2) اجعل حسابك مديرًا
1. أنشئ حسابك من التطبيق بعد أول بناء، أو من Authentication > Users بعد إعداد المشروع.
2. انسخ UUID الخاص بحسابك من Authentication > Users.
3. في SQL Editor شغّل الأمر التالي مع استبدال UUID بمعرّف حسابك:
   update public.profiles set role='admin' where id='ضع-UUID-هنا';

## 3) رفع المشروع إلى GitHub
ارفع محتويات هذا المجلد إلى جذر مستودع جديد، مع إظهار المجلد المخفي `.github`.
يجب أن يكون `package.json` و`index.html` و`src` و`supabase-setup.sql` في جذر المستودع.

## 4) أضف أسرار Supabase إلى GitHub
من المستودع: Settings > Secrets and variables > Actions > New repository secret.
أنشئ السرّين التاليين:
- الاسم: `VITE_SUPABASE_URL` والقيمة: Project URL
- الاسم: `VITE_SUPABASE_ANON_KEY` والقيمة: Publishable key

لا تضع كلمة مرور قاعدة البيانات أو Secret/service_role key في GitHub Actions.

## 5) بناء APK
1. افتح Actions.
2. اختر Build Tahaddi Android APK.
3. اضغط Run workflow ثم Run workflow.
4. عند نجاح العملية افتح ملخص التشغيل.
5. تحت Artifacts حمّل `Tahaddi-APK` ثم فك ضغطه.
6. ثبّت `app-debug.apk` على أندرويد.

## ملاحظات
- أول تشغيل قد يستغرق عدة دقائق.
- ملف APK الناتج Debug للتجربة والتوزيع الخاص. لا تنشره كتطبيق متجر قبل إعداد توقيع Release.
- يجب تفعيل تأكيد البريد في Supabase أو تعطيله حسب رغبتك من Authentication > Providers > Email.
- لا تشارك مفاتيح Secret أو service_role.
