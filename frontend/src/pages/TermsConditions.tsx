import React from 'react';

export default function TermsConditions() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-4xl font-bold mb-8 text-center text-blue-600 dark:text-blue-400">
        Terms & Conditions
      </h1>

      <div className="space-y-8">
        {/* Section 1 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            1. Acceptance of Terms
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            By accessing and using this application, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
          </p>
        </section>

        {/* Section 2 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            2. Use License
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
            Permission is granted to temporarily download one copy of the materials (information or software) on our application for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
          </p>
          <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 space-y-2 ml-4">
            <li>Modifying or copying the materials</li>
            <li>Using the materials for any commercial purpose or for any public display</li>
            <li>Attempting to decompile or reverse engineer any software contained on the application</li>
            <li>Removing any copyright or other proprietary notations from the materials</li>
            <li>Transferring the materials to another person or "mirroring" the materials on any other server</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            3. Disclaimer
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            The materials on our application are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
          </p>
        </section>

        {/* Section 4 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            4. Limitations
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            In no event shall our company or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on our website, even if we or our authorized representative has been notified orally or in writing of the possibility of such damage.
          </p>
        </section>

        {/* Section 5 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            5. Accuracy of Materials
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            The materials appearing on our application could include technical, typographical, or photographic errors. Our company does not warrant that any of the materials on our application are accurate, complete, or current. We may make changes to the materials contained on our application at any time without notice.
          </p>
        </section>

        {/* Section 6 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            6. Links
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We have not reviewed all of the sites linked to our application and are not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by us of the site. Use of any such linked application is at the user's own risk.
          </p>
        </section>

        {/* Section 7 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            7. Modifications
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            We may revise these terms of service for our application at any time without notice. By using this application, you are agreeing to be bound by the then current version of these terms of service.
          </p>
        </section>

        {/* Section 8 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            8. Governing Law
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction where the company is located, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
          </p>
        </section>

        {/* Section 9 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            9. User Conduct
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
            You agree not to post, transmit, or otherwise make available through the site any content that:
          </p>
          <ul className="list-disc list-inside text-neutral-700 dark:text-neutral-300 space-y-2 ml-4">
            <li>Is unlawful or promotes illegal activity</li>
            <li>Is abusive, harassing, or threatening</li>
            <li>Infringes on any intellectual property rights</li>
            <li>Contains viruses or malicious code</li>
            <li>Impersonates any person or entity</li>
          </ul>
        </section>

        {/* Section 10 */}
        <section>
          <h2 className="text-2xl font-semibold mb-4 text-neutral-900 dark:text-neutral-50">
            10. Contact Information
          </h2>
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            If you have any questions about these Terms & Conditions, please contact us at{' '}
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
