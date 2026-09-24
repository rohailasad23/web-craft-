import React from 'react';

export default function Sidebar({ lpData, selectedSection, setSelectedSection }) {
  const sections = lpData?.currentState?.sections || [];

  return (
    <div className="w-64 bg-white border-r p-4 overflow-y-auto">
      <h2 className="font-bold mb-4 text-gray-700">Sections</h2>
      <div className="space-y-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setSelectedSection(section.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm capitalize transition ${
              selectedSection === section.id
                ? 'bg-blue-100 text-blue-700 font-semibold'
                : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            {section.type}
          </button>
        ))}
      </div>
    </div>
  );
}
