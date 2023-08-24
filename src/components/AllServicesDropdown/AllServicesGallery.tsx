import React, { Fragment } from 'react';
import { Gallery } from '@patternfly/react-core/dist/dynamic/layouts/Gallery';
import { AllServicesGroup, AllServicesLink, AllServicesSection, isAllServicesGroup } from '../AllServices/allServicesLinks';
import AllServicesGalleryLink from './AllServicesGalleryLink';
import AllServicesGallerySection from './AllServicesGallerySection';

export type AllServicesGalleryProps = {
  selectedService: AllServicesSection;
};

const AllServicesGallery = ({ selectedService }: AllServicesGalleryProps) => {
  const sections: AllServicesGroup[] = [];
  const links: AllServicesLink[] = [];
  selectedService.links.forEach((link) => {
    if (isAllServicesGroup(link)) {
      sections.push(link);
    } else {
      links.push(link);
    }
  });
  return (
    <Fragment>
      <Gallery hasGutter>
        {links.map((link, index) => (
          <AllServicesGalleryLink key={index} {...link} />
        ))}
      </Gallery>
      {sections.map((section, index) => (
        <AllServicesGallerySection key={index} {...section} />
      ))}
    </Fragment>
  );
};

export default AllServicesGallery;
