import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-4xl font-bold mb-8 text-center text-blue-600 dark:text-blue-400">
        Privacy Policy
      </h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            1. Introduction
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We are committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and the choices you have when using our application.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            2. Information We Collect
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
            We collect information to provide and improve our services. The information we collect may include:
          </p>
          <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 space-y-2 ml-4">
            <li><strong>Account Information:</strong> email address, username, password hash, profile image, bio, and preferences</li>
            <li><strong>Usage Information:</strong> device type, browser, IP address, pages visited, and actions taken in the application</li>
            <li><strong>Message Metadata:</strong> timestamps, sender and recipient identifiers, and message delivery status</li>
            <li><strong>User Content:</strong> messages, comments, uploaded images, and other content you choose to share</li>
            <li><strong>Support Data:</strong> communications with our support team, feedback, and reports</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            3. How We Use Your Information
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
            We use your information to operate, maintain, and provide features of the application. This includes:
          </p>
          <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 space-y-2 ml-4">
            <li>Creating and managing your account</li>
            <li>Delivering messages, chats, and community interactions</li>
            <li>Personalizing your experience and preferences</li>
            <li>Providing customer support and responding to inquiries</li>
            <li>Detecting, preventing, and investigating abuse, fraud, and security issues</li>
            <li>Analyzing usage trends to improve the application</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            4. Information Sharing</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
            We do not sell your personal information. We may share information in the following situations:
          </p>
          <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 space-y-2 ml-4">
            <li><strong>Service Providers:</strong> third parties who help us operate the application and provide services such as hosting, analytics, and payment processing</li>
            <li><strong>Legal Requirements:</strong> when required by law, court order, or government request, or to protect the rights, property, or safety of our users or others</li>
            <li><strong>Business Transfers:</strong> in connection with a merger, acquisition, or sale of assets</li>
            <li><strong>Other Users:</strong> content you post or share may be visible to other users as part of the application functionality</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            5. Cookies and Tracking</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We may use cookies and similar technologies to remember your preferences, support login sessions, and analyze how the application is used. You can control cookies through your browser settings, but disabling cookies may affect the application's functionality.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            6. Security</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We take reasonable measures to protect your information and use appropriate technical and organizational safeguards. However, no system is entirely secure, and we cannot guarantee the absolute security of your data.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            7. Data Retention</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We retain your information for as long as necessary to provide the application, comply with legal obligations, resolve disputes, and enforce agreements.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            8. Your Rights</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
            Depending on your location, you may have rights to access, correct, or delete your information, and to object to certain processing. To exercise your rights, contact us using the information below.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            9. Changes to This Policy</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We may update this Privacy Policy from time to time. When we make changes, we will revise the "Last updated" date at the bottom of this page.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            10. Contact Information</h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            If you have questions about this Privacy Policy or our privacy practices, please contact us at{' '}
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
