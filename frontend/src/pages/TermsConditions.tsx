import React from 'react';

export default function TermsConditions() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-4xl font-bold mb-8 text-center text-blue-600 dark:text-blue-400">
        Terms & Conditions
      </h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            1. Acceptance of Terms
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            By accessing or using this application, you agree to be bound by these Terms & Conditions and all other operating rules, policies, and procedures that may be published from time to time by us.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            2. Eligibility
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            You must be at least 13 years old to use this application. If you are under 18, you may only use the service with the permission of a parent or guardian. By using the application, you represent and warrant that you meet all eligibility requirements.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            3. Account Registration
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            When you create an account, you agree to provide accurate and complete information. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            4. User Conduct</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
            You must use the application in a lawful and respectful manner. Prohibited conduct includes, but is not limited to:
          </p>
          <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 space-y-2 ml-4">
            <li>Posting illegal, harassing, abusive, or hateful content</li>
            <li>Impersonating others or misrepresenting your identity</li>
            <li>Uploading malware, spam, or any malicious content</li>
            <li>Violating intellectual property rights</li>
            <li>Interfering with the operation of the application or other users' access</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            5. User Content
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            You retain ownership of the content you post, send, or share through the application. By submitting content, you grant us a worldwide, royalty-free, non-exclusive license to host, store, display, and distribute that content as necessary to provide the service.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            6. Privacy and Security</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            Your use of the application is also subject to our Privacy Policy. We use industry-standard security measures to protect your information, but we cannot guarantee complete security of data transmitted over the Internet.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            7. Service Availability</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We may modify, suspend, or discontinue the application or any portion of it at any time without notice. We are not liable for any loss or damage resulting from the unavailability of the application.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            8. Limitation of Liability</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            To the fullest extent permitted by law, we are not liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the application.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            9. Updates to Terms</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We may update these Terms & Conditions at any time. Continued use of the application after changes are posted constitutes acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            10. Contact Information</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            If you have questions about these Terms & Conditions, please contact us at{' '}
            <a href="mailto:sociovio4@gmail.com" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 underline">
              sociovio4@gmail.com
            </a>
          </p>
        </section>
      </div>

      <div className="mt-12 pt-8 border-t border-gray-300 dark:border-gray-600 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
