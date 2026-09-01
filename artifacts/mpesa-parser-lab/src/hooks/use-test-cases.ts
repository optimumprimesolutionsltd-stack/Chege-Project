import { useState, useEffect, useCallback } from 'react';

export interface TestCase {
  id: string;
  name: string;
  message: string;
  createdAt: string;
  lastStatus?: string;
  lastConfidence?: string;
}

const LOCAL_STORAGE_KEY = 'mpesa-parser-lab-cases';

export function useTestCases() {
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setTestCases(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to parse saved test cases from localStorage', e);
    }
  }, []);

  const saveTestCase = useCallback((testCase: Omit<TestCase, 'id' | 'createdAt'>) => {
    const newCase: TestCase = {
      ...testCase,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    
    setTestCases(prev => {
      const updated = [newCase, ...prev];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    
    return newCase;
  }, []);

  const updateTestCaseStatus = useCallback((id: string, status: string, confidence: string) => {
    setTestCases(prev => {
      const updated = prev.map(tc => 
        tc.id === id ? { ...tc, lastStatus: status, lastConfidence: confidence } : tc
      );
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteTestCase = useCallback((id: string) => {
    setTestCases(prev => {
      const updated = prev.filter(tc => tc.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return {
    testCases,
    saveTestCase,
    updateTestCaseStatus,
    deleteTestCase
  };
}
