import React from 'react';

export default function Canvas({ lpData, selectedSection, updateSection }) {
  const sections = lpData?.currentState?.sections || [];

  const handleTextEdit = (section, field, value) => {
    updateSection(section.id, { content: { [field]: value } });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
      <div className="bg-white max-w-3xl mx-auto rounded-lg shadow overflow-hidden">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`p-8 border-b ${selectedSection === section.id ? 'ring-2 ring-blue-400' : ''}`}
            style={{ backgroundColor: section.styling?.backgroundColor ? `${section.styling.backgroundColor}15` : undefined }}
          >
            {section.type === 'hero' && (
              <div className="text-center">
                <input
                  className="text-3xl font-bold text-center w-full mb-3 bg-transparent focus:outline-none focus:bg-yellow-50"
                  value={section.content?.headline || ''}
                  onChange={(e) => handleTextEdit(section, 'headline', e.target.value)}
                />
                <input
                  className="text-lg text-center w-full mb-4 bg-transparent focus:outline-none focus:bg-yellow-50"
                  value={section.content?.subheadline || ''}
                  onChange={(e) => handleTextEdit(section, 'subheadline', e.target.value)}
                />
                <button className="px-6 py-2 rounded-full text-white" style={{ backgroundColor: lpData?.colorScheme }}>
                  {section.content?.cta}
                </button>
              </div>
            )}

            {section.type === 'features' && (
              <div>
                <h3 className="text-xl font-bold mb-4 text-center">{section.content?.title}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(section.content?.features || []).map((f, idx) => (
                    <div key={idx} className="text-center p-3">
                      <p className="font-semibold">{f.title}</p>
                      <p className="text-sm text-gray-500">{f.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {section.type === 'cta' && (
              <div className="text-center">
                <h3 className="text-xl font-bold mb-2">{section.content?.headline}</h3>
                <p className="text-gray-500 mb-4">{section.content?.description}</p>
                <button className="px-6 py-2 rounded-full text-white" style={{ backgroundColor: lpData?.colorScheme }}>
                  {section.content?.buttonText}
                </button>
              </div>
            )}

            {section.type === 'footer' && (
              <div className="text-center text-sm text-gray-500">
                <p>{section.content?.businessName}</p>
                <p>{section.content?.text}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
