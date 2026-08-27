import React, { useState } from 'react';
import { generateCSR, downloadFile } from '../api/certificateApi';

const countries = [
  ['IN', 'India'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['GB', 'United Kingdom'],
  ['AU', 'Australia'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['JP', 'Japan'],
  ['CN', 'China'],
  ['SG', 'Singapore'],
  ['AE', 'United Arab Emirates'],
  ['BR', 'Brazil'],
  ['ZA', 'South Africa'],
  ['NZ', 'New Zealand'],
];

const CSRForm = () => {
  const [formData, setFormData] = useState({
    domain: '',
    company: '',
    division: '',
    city: '',
    state: '',
    country: '',
    email: '',
    rootLength: '',
    username: '', // Added to capture the username
  });

  const [generatedFiles, setGeneratedFiles] = useState(null); // To track generated file names

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await generateCSR(formData);

    if (result.success) {
      alert('CSR generated successfully');
      setGeneratedFiles({
        csrFile: result.csrFile,
        certificateFile: result.certificateFile, // Added for certificate download
      });
    } else {
      alert('CSR generation failed: ' + result.message);
    }
  };

  const handleDownload = (fileName) => {
    downloadFile(fileName);
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4">Generate CSR</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        {Object.entries(formData).map(([field, value]) => (
          field === 'country' ? (
            <select
              key={field}
              name={field}
              value={value}
              onChange={handleChange}
              className="w-full p-2 border rounded"
              required
            >
              <option value="">Select country</option>
              {countries.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={field}
              type="text"
              name={field}
              placeholder={field}
              value={value}
              onChange={handleChange}
              className="w-full p-2 border rounded"
              required
            />
          )
        ))}
        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
          Submit
        </button>
      </form>

      {generatedFiles && (
        <div className="mt-4 space-x-4">
          <button
            onClick={() => handleDownload(generatedFiles.csrFile)}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Download CSR
          </button>
          <button
            onClick={() => handleDownload(generatedFiles.certificateFile)} // Download the certificate
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Download Certificate
          </button>
        </div>
      )}
    </div>
  );
};

export default CSRForm;
